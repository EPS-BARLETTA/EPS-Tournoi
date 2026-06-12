/* === EPS TOURNOI — constantes et état initial === */

const STORAGE_KEY = 'eps-tournoi-v1';
const SESSIONS_KEY = 'eps-tournoi-sessions-v1';
const CLASSROOMS_KEY = 'eps-classrooms-v1';
const TEAM_COLOR_SUGGESTIONS = ['Bleu', 'Rouge', 'Vert', 'Jaune', 'Orange', 'Blanc', 'Noir', 'Rose'];

const TOURNAMENT_MODES = {
  'round-robin': { label: 'Championnat' },
  'groups-finals': { label: 'Coupe du monde' },
  'groups-pools': { label: 'Poules' },
  'rotating-teams': { label: 'Poules tournantes' },
  ladder: { label: 'Échelle / Ladder' },
  swiss: { label: 'Ronde suisse' },
  challenge: { label: 'Défi' },
};

const FORMAT_DEFINITIONS = {
  'sport-co': [
    { id: 'round-robin', icon: '🏆', title: 'Championnat', description: 'Toutes les équipes se rencontrent', recommended: true },
    { id: 'groups-finals', icon: '🌍', title: 'Coupe du monde', description: 'Phases de poules + finale', recommended: false },
    { id: 'rotating-teams', icon: '🔄', title: 'Poules tournantes', description: "Les joueurs changent d'équipe à chaque rotation", recommended: false },
  ],
  raquette: [
    { id: 'round-robin', icon: '🏸', title: 'Tournoi poule', description: 'Tous contre tous sur les terrains', recommended: true },
    { id: 'groups-pools', icon: '🏸', title: 'Poules', description: 'Groupes de 3–6 joueurs, rotations et rôles dans chaque poule', recommended: true },
    { id: 'ladder', icon: '🪜', title: 'Échelle / Ladder', description: 'Montée-descente entre les terrains', recommended: false },
    { id: 'swiss', icon: '🇨🇭', title: 'Ronde suisse', description: 'Appariement progressif selon le niveau', recommended: false },
    { id: 'challenge', icon: '⚔️', title: 'Défi', description: 'Classement vivant — défie quelqu\'un mieux classé', recommended: false },
  ],
};

const dom = {};
const runtime = {
  timerInterval: null,
  helpTab: 'start',
};
const NEW_TOURNAMENT_STEP_COUNT = 5;

function createDefaultDraft() {
  return {
    sport: 'sport-co',
    format: 'round-robin',
    participantCount: 24,
    selectedConfigKey: '',
    teamNames: [],
    studentNamesText: '',
    fields: 2,
    startTime: '10:00',
    endTime: '11:00',
    duration: 7,
    rotatingReferee: false,
    scoreTable: false,
    sessionName: '',
    challengeRange: 5,
    poolSize: 4,
    challengeInitialRanking: [],
    challengePlacementMode: 'auto',
    ladderArbitratedFields: [],
    ladderInitialSlots: [],
    ladderPlacementMode: 'auto',
    newStep: 1,
  };
}

function createDefaultState() {
  return {
    view: 'home',
    draft: createDefaultDraft(),
    currentSession: null,
    lastStatsSessionId: null,
    timer: {
      totalSeconds: 0,
      remainingSeconds: 0,
      running: false,
    },
  };
}

let state = sanitizeState(loadState() || createDefaultState());

/* === Helpers généraux === */

function clampNumber(value, min, max, fallback) {
  if (Number.isNaN(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function clampSetupCount(value, fallback = 24) {
  return clampNumber(Number(value) || fallback, 4, 48, fallback);
}

function clampDraftStep(value) {
  return clampNumber(Number(value) || 1, 1, NEW_TOURNAMENT_STEP_COUNT, 1);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDisplayName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  const firstName = parts[parts.length - 1];
  const familyParts = parts.slice(0, parts.length - 1);
  const initials = familyParts.map(p => p.charAt(0).toUpperCase()).join('-');
  return `${initials}. ${firstName}`;
}

function uniqueId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function cloneData(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis !== 'undefined' && typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function addListenerIfPresent(element, eventName, handler, options) {
  if (!element) return false;
  element.addEventListener(eventName, handler, options);
  return true;
}

function isTeamSession(session) {
  return session?.sport === 'sport-co' && session?.format !== 'rotating-teams';
}

function getParticipantLabel(session, count = 2) {
  const plural = count !== 1;
  if (isTeamSession(session)) return plural ? 'Équipes' : 'Équipe';
  if (session?.sport === 'raquette') return plural ? 'Joueurs' : 'Joueur';
  return plural ? 'Élèves' : 'Élève';
}

function parseTime(value) {
  if (!value) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function formatTimeLabel(value) {
  if (!value && value !== 0) return '';
  const hours = String(Math.floor(value / 60)).padStart(2, '0');
  const minutes = String(value % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getAvailableWindow(options) {
  const start = parseTime(options.startTime);
  const end = parseTime(options.endTime);
  if (start == null || end == null) return { availableMinutes: null };
  const diff = end - start;
  if (diff < 0) return { availableMinutes: null, invertedWarning: true };
  return { availableMinutes: diff };
}

function buildMatchKey(rotationNumber, home, away) {
  return `r${rotationNumber}-${encodeURIComponent(home)}-${encodeURIComponent(away)}`;
}

function parseNames(text) {
  return String(text || '')
    .split(/[\n,;]+/)
    .map(value => value.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function ensureTeamListLength(list, length, prefix = 'Équipe') {
  const current = Array.isArray(list) ? [...list] : [];
  while (current.length < length) {
    current.push(`${prefix} ${current.length + 1}`);
  }
  return current.slice(0, length).map((name, index) => {
    const clean = String(name || '').trim();
    return clean || `${prefix} ${index + 1}`;
  });
}

function getEnabledRolesFromOptions(options = {}) {
  const roles = [];
  if (options.rotatingReferee) roles.push('Arbitre');
  if (options.scoreTable) roles.push('Table');
  return roles;
}

function assignRolesForByes(byeList, enabledRoles) {
  const names = Array.isArray(byeList) ? byeList.filter(Boolean) : [];
  const roles = Array.isArray(enabledRoles) && enabledRoles.length ? enabledRoles : ['Spectateur actif'];
  return names.map((name, index) => ({
    name,
    role: roles[index % roles.length],
  }));
}

function assignLadderByeAssignments(byeList, options = {}) {
  const names = Array.isArray(byeList) ? byeList.filter(Boolean) : [];
  if (!names.length) return [];
  if (!options.rotatingReferee) {
    return assignRolesForByes(names, getEnabledRolesFromOptions(options));
  }
  const assignments = [];
  const remaining = [...names];
  if (options.scoreTable && remaining.length) {
    assignments.push({
      name: remaining.shift(),
      role: 'Table',
    });
  }
  return [
    ...assignments,
    ...remaining.map(name => ({
      name,
      role: 'Spectateur actif',
    })),
  ];
}

function buildTeamCompositionLabel(teamSizes) {
  const counts = new Map();
  [...teamSizes].sort((left, right) => right - left).forEach(size => {
    counts.set(size, (counts.get(size) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((left, right) => right[0] - left[0])
    .map(([size, count]) => `${count} équipe${count > 1 ? 's' : ''} de ${size}`)
    .join(' + ');
}

function getSuggestionSource(sourceOrCount) {
  if (sourceOrCount && typeof sourceOrCount === 'object') {
    return {
      ...createDefaultDraft(),
      ...sourceOrCount,
    };
  }
  return {
    ...createDefaultDraft(),
    participantCount: clampSetupCount(sourceOrCount, 24),
    fields: state?.draft?.fields || 2,
  };
}

function createSuggestedTeamConfig(teamSizes, source, score) {
  const sortedSizes = [...teamSizes].sort((left, right) => right - left);
  const teamCount = sortedSizes.length;
  const minSize = Math.min(...sortedSizes);
  const maxSize = Math.max(...sortedSizes);
  const fields = clampNumber(Number(source.fields) || 2, 1, 20, 2);
  const activeTeams = Math.min(teamCount, fields * 2);
  const restingTeams = Math.max(teamCount - activeTeams, 0);
  const composition = buildTeamCompositionLabel(sortedSizes);
  const usesAllFields = activeTeams >= fields * 2;
  const replacementNote = maxSize > 4
    ? `Les équipes de ${maxSize} peuvent tourner avec remplacements courts.`
    : 'Tous les élèves restent engagés sans remplaçant interne.';
  const flowNote = restingTeams > 0
    ? `${fields} terrain${fields > 1 ? 's utilisés' : ' utilisé'} en continu, avec ${restingTeams} équipe${restingTeams > 1 ? 's' : ''} au repos à chaque rotation.`
    : `${fields} terrain${fields > 1 ? 's utilisés' : ' utilisé'} en continu, sans équipe au repos.`;
  return {
    key: `teams-${sortedSizes.join('-')}`,
    teamSize: Math.round(sortedSizes.reduce((sum, size) => sum + size, 0) / Math.max(teamCount, 1)),
    teamSizes: sortedSizes,
    teamCount,
    substitutes: 0,
    exact: minSize === maxSize,
    acceptable: minSize >= 4 && maxSize <= 6,
    inPreferredBand: minSize >= 4 && maxSize <= 6,
    usesAllFields,
    restingTeams,
    composition,
    recommendationScore: score,
    label: `${teamCount} équipes`,
    summary: composition,
    explanation: `${composition}. ${flowNote} ${replacementNote}`,
  };
}

function getSuggestedTeamConfigurations(sourceOrCount) {
  const source = getSuggestionSource(sourceOrCount);
  const safeCount = clampSetupCount(source.participantCount, 24);
  const targetTeams = Math.max(2, clampNumber(Number(source.fields) || 2, 1, 20, 2) * 2);
  return Array.from({ length: Math.min(10, safeCount - 1) }, (_, index) => index + 2)
    .map(teamCount => {
      const baseSize = Math.floor(safeCount / teamCount);
      const extraPlayers = safeCount % teamCount;
      const maxSize = baseSize + (extraPlayers > 0 ? 1 : 0);
      if (baseSize < 3 || maxSize > 7) return null;
      const teamSizes = Array.from({ length: teamCount }, (_, index) => (index < extraPlayers ? baseSize + 1 : baseSize));
      let score = 0;
      score += Math.abs(teamCount - targetTeams) * 7;
      score += Math.abs(((baseSize + maxSize) / 2) - 4.5) * 5;
      score += Math.abs(maxSize - baseSize) * 4;
      if (teamCount % 2 === 1) score += 8;
      if (baseSize < 4) score += 10;
      if (maxSize > 6) score += 10;
      if (baseSize >= 4 && maxSize <= 6) score -= 8;
      if (teamCount === targetTeams) score -= 6;
      if (teamCount > targetTeams + 1) score += 3;
      if (teamCount < targetTeams) score += 2;
      if (targetTeams >= 4 && teamCount === targetTeams - 1 && maxSize <= 5) score += 2;
      return createSuggestedTeamConfig(teamSizes, source, score);
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.recommendationScore !== right.recommendationScore) return left.recommendationScore - right.recommendationScore;
      if (left.usesAllFields !== right.usesAllFields) return left.usesAllFields ? -1 : 1;
      if (left.restingTeams !== right.restingTeams) return left.restingTeams - right.restingTeams;
      if (left.teamCount !== right.teamCount) return Math.abs(left.teamCount - targetTeams) - Math.abs(right.teamCount - targetTeams);
      return right.teamSize - left.teamSize;
    })
    .slice(0, 4)
    .map((entry, index) => ({
      ...entry,
      recommended: index === 0,
    }));
}

function getEstimatedRotationCount(participantCount, fieldCount, options = {}) {
  const safeCount = Math.max(2, Number(participantCount) || 2);
  const safeFields = Math.max(1, Number(fieldCount) || 1);
  const teamBased = Boolean(options.teamBased);
  const estimate = teamBased
    ? safeCount + safeFields
    : Math.ceil(safeCount / Math.max(safeFields * 2, 1)) + safeFields + 1;
  return clampNumber(estimate, 4, 12, 8);
}

function getSuggestedDurationFromWindow(availableMinutes, rotationEstimate, fallback = 7) {
  if (!Number.isFinite(availableMinutes) || availableMinutes <= 0) return fallback;
  return clampNumber(Math.floor(availableMinutes / Math.max(rotationEstimate, 1)), 1, 60, fallback);
}

function getTournamentType(source = state.draft) {
  const format = source?.format || 'round-robin';
  return Object.prototype.hasOwnProperty.call(TOURNAMENT_MODES, format) ? format : 'round-robin';
}

function getCurrentFormatDefinition() {
  const sport = state.draft.sport === 'raquette' ? 'raquette' : 'sport-co';
  const found = FORMAT_DEFINITIONS[sport].find(entry => entry.id === state.draft.format);
  return found || FORMAT_DEFINITIONS[sport][0];
}

function isTeamBasedSource(source) {
  return source?.sport === 'sport-co' && source?.format !== 'rotating-teams';
}

function isTeamBasedDraft() {
  return isTeamBasedSource(state.draft);
}

function getSelectedConfigurationForSource(source = state.draft) {
  if (!isTeamBasedSource(source)) return null;
  const suggestions = getSuggestedTeamConfigurations(source);
  if (!suggestions.length) return null;
  return suggestions.find(entry => entry.key === source.selectedConfigKey) || suggestions[0];
}

function getSelectedConfiguration() {
  const selected = getSelectedConfigurationForSource(state.draft);
  if (!selected) return null;
  state.draft.selectedConfigKey = selected.key;
  return selected;
}

function buildDefaultTeamNameSuggestions(count) {
  return TEAM_COLOR_SUGGESTIONS.slice(0, count).concat(
    Array.from(
      { length: Math.max(0, count - TEAM_COLOR_SUGGESTIONS.length) },
      (_, index) => `Équipe ${TEAM_COLOR_SUGGESTIONS.length + index + 1}`
    )
  );
}

function getDraftTeamNames(config) {
  const count = config?.teamCount || 0;
  const defaults = ensureTeamListLength(
    buildDefaultTeamNameSuggestions(count),
    count,
    'Équipe'
  );
  if (!count) return [];
  state.draft.teamNames = ensureTeamListLength(state.draft.teamNames.length ? state.draft.teamNames : defaults, count, 'Équipe');
  return state.draft.teamNames;
}

function getDraftTeamNamesForSource(source, config) {
  const count = config?.teamCount || 0;
  if (!count) return [];
  const defaults = ensureTeamListLength(buildDefaultTeamNameSuggestions(count), count, 'Équipe');
  const current = Array.isArray(source?.teamNames) && source.teamNames.length ? source.teamNames : defaults;
  return ensureTeamListLength(current, count, 'Équipe');
}

function getDraftStudentNames(count) {
  const typed = parseNames(state.draft.studentNamesText);
  if (!typed.length) {
    return ensureTeamListLength([], count, 'Élève');
  }
  return ensureTeamListLength(typed, count, 'Élève');
}

function getDraftStudentNamesForSource(source, count) {
  const typed = parseNames(source?.studentNamesText);
  if (!typed.length) {
    return ensureTeamListLength([], count, 'Élève');
  }
  return ensureTeamListLength(typed, count, 'Élève');
}

function getChallengePlayerPoolForSource(source = state.draft) {
  const safeSource = {
    ...createDefaultDraft(),
    ...(source || {}),
  };
  return getDraftStudentNamesForSource(safeSource, clampSetupCount(safeSource.participantCount, 24));
}

function buildAutomaticChallengeInitialRanking(playerNames, alphabetical = false) {
  const names = alphabetical
    ? [...playerNames].sort((left, right) => left.localeCompare(right, 'fr', { sensitivity: 'base' }))
    : [...playerNames];
  return names.map((name, index) => ({
    rank: index + 1,
    name: String(name || '').trim(),
  }));
}

function buildRandomChallengeInitialRanking(playerNames, randomFn = Math.random) {
  const names = [...playerNames];
  for (let index = names.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomFn() * (index + 1));
    [names[index], names[swapIndex]] = [names[swapIndex], names[index]];
  }
  return buildAutomaticChallengeInitialRanking(names, false);
}

function buildEmptyChallengeInitialRanking(source = state.draft) {
  const count = clampSetupCount(source?.participantCount, 24);
  return Array.from({ length: count }, (_, index) => ({
    rank: index + 1,
    name: '',
  }));
}

function getDraftChallengeInitialRankingForSource(source = state.draft) {
  const players = getChallengePlayerPoolForSource(source);
  const roster = new Set(players);
  const count = players.length;
  const existing = Array.isArray(source?.challengeInitialRanking) ? source.challengeInitialRanking : [];
  const byRank = new Map(existing.map(entry => [Number(entry?.rank), entry || {}]));
  return Array.from({ length: count }, (_, index) => {
    const rank = index + 1;
    const entry = byRank.get(rank) || {};
    const text = String(entry.name || '').trim();
    return {
      rank,
      name: text && roster.has(text) ? text : '',
    };
  });
}

function resolveChallengeInitialRankingForSource(source = state.draft) {
  const ranking = getDraftChallengeInitialRankingForSource(source);
  const hasAssignedPlayer = ranking.some(entry => entry.name);
  if (hasAssignedPlayer) return ranking;
  if (source?.challengePlacementMode === 'manual') return ranking;
  return buildAutomaticChallengeInitialRanking(getChallengePlayerPoolForSource(source), source?.challengePlacementMode === 'alpha');
}

function getChallengePlacementValidation(source = state.draft) {
  const players = getChallengePlayerPoolForSource(source);
  const ranking = resolveChallengeInitialRankingForSource(source);
  const roster = new Set(players);
  const seen = new Map();
  const duplicates = [];
  const unknown = [];
  const assigned = [];
  ranking.forEach(entry => {
    const name = String(entry.name || '').trim();
    if (!name) return;
    assigned.push(name);
    if (!roster.has(name)) unknown.push(name);
    if (seen.has(name)) duplicates.push(name);
    else seen.set(name, entry.rank);
  });
  const unplaced = players.filter(name => !seen.has(name));
  return {
    valid: duplicates.length === 0 && unknown.length === 0 && unplaced.length === 0 && assigned.length === players.length,
    players,
    ranking,
    assigned,
    unplaced,
    duplicates: [...new Set(duplicates)],
    unknown: [...new Set(unknown)],
  };
}

function persistDraftChallengeInitialRanking(ranking) {
  state.draft.challengeInitialRanking = (ranking || []).map(entry => ({
    rank: Number(entry.rank),
    name: String(entry.name || '').trim(),
  }));
}

function applyDraftChallengePlacementMode(mode = 'auto') {
  const players = getChallengePlayerPoolForSource(state.draft);
  if (mode === 'manual') {
    persistDraftChallengeInitialRanking(buildEmptyChallengeInitialRanking(state.draft));
    state.draft.challengePlacementMode = 'manual';
    return;
  }
  if (mode === 'random') {
    persistDraftChallengeInitialRanking(buildRandomChallengeInitialRanking(players));
    state.draft.challengePlacementMode = 'random';
    return;
  }
  persistDraftChallengeInitialRanking(buildAutomaticChallengeInitialRanking(players, mode === 'alpha'));
  state.draft.challengePlacementMode = mode === 'alpha' ? 'alpha' : 'auto';
}

function setDraftChallengeRankValue(rankNumber, nextValue) {
  const ranking = getDraftChallengeInitialRankingForSource(state.draft).map(entry => ({ ...entry }));
  const target = ranking.find(entry => entry.rank === rankNumber);
  if (!target) return;
  const normalized = String(nextValue || '').trim();
  const currentValue = String(target.name || '').trim();
  if (normalized && normalized !== currentValue) {
    ranking.forEach(entry => {
      if (entry.rank !== rankNumber && String(entry.name || '').trim() === normalized) {
        entry.name = currentValue;
      }
    });
  }
  target.name = normalized;
  persistDraftChallengeInitialRanking(ranking);
  state.draft.challengePlacementMode = 'manual';
}

function getAvailableChallengePlayersForRank(source = state.draft, rankNumber) {
  const players = getChallengePlayerPoolForSource(source);
  const ranking = getDraftChallengeInitialRankingForSource(source);
  const target = ranking.find(entry => entry.rank === rankNumber);
  const currentValue = String(target?.name || '').trim();
  const usedElsewhere = new Set();
  ranking.forEach(entry => {
    if (entry.rank === rankNumber) return;
    const value = String(entry.name || '').trim();
    if (value) usedElsewhere.add(value);
  });
  return players.filter(name => name === currentValue || !usedElsewhere.has(name));
}

function normalizeLadderArbitratedFieldsForSource(source = state.draft) {
  const maxField = clampNumber(Number(source?.fields) || 2, 1, 20, 2);
  const raw = Array.isArray(source?.ladderArbitratedFields) ? source.ladderArbitratedFields : [];
  return [...new Set(raw
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value >= 1 && value <= maxField))]
    .sort((left, right) => left - right);
}

function getLadderPlayerPoolForSource(source = state.draft) {
  const safeSource = {
    ...createDefaultDraft(),
    ...(source || {}),
  };
  return getDraftStudentNamesForSource(safeSource, clampSetupCount(safeSource.participantCount, 24));
}

function buildAutomaticLadderInitialSlots(playerNames, source = state.draft, alphabetical = false) {
  const names = alphabetical
    ? [...playerNames].sort((left, right) => left.localeCompare(right, 'fr', { sensitivity: 'base' }))
    : [...playerNames];
  const arbitratedFields = new Set(normalizeLadderArbitratedFieldsForSource(source));
  const fieldCount = clampNumber(Number(source?.fields) || 2, 1, 20, 2);
  const slots = [];
  let cursor = 0;
  for (let field = 1; field <= fieldCount; field += 1) {
    const hasReferee = arbitratedFields.has(field);
    const needed = hasReferee ? 3 : 2;
    if (cursor + needed > names.length) {
      slots.push({
        field,
        home: '',
        away: '',
        referee: hasReferee ? '' : '',
        hasReferee,
      });
      continue;
    }
    const home = names[cursor] || '';
    const away = names[cursor + 1] || '';
    const referee = hasReferee ? (names[cursor + 2] || '') : '';
    cursor += needed;
    slots.push({
      field,
      home,
      away,
      referee,
      hasReferee,
    });
  }
  return slots;
}

function buildRandomLadderInitialSlots(playerNames, source = state.draft, randomFn = Math.random) {
  const names = [...playerNames];
  for (let index = names.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomFn() * (index + 1));
    [names[index], names[swapIndex]] = [names[swapIndex], names[index]];
  }
  return buildAutomaticLadderInitialSlots(names, source, false);
}

function buildEmptyLadderInitialSlots(source = state.draft) {
  const fieldCount = clampNumber(Number(source?.fields) || 2, 1, 20, 2);
  const arbitratedFields = new Set(normalizeLadderArbitratedFieldsForSource(source));
  return Array.from({ length: fieldCount }, (_, index) => ({
    field: index + 1,
    home: '',
    away: '',
    referee: '',
    hasReferee: arbitratedFields.has(index + 1),
  }));
}

function getDraftLadderInitialSlotsForSource(source = state.draft) {
  const fieldCount = clampNumber(Number(source?.fields) || 2, 1, 20, 2);
  const arbitratedFields = new Set(normalizeLadderArbitratedFieldsForSource(source));
  const roster = new Set(getLadderPlayerPoolForSource(source));
  const existing = Array.isArray(source?.ladderInitialSlots) ? source.ladderInitialSlots : [];
  const byField = new Map(existing.map(slot => [Number(slot?.field), slot || {}]));
  return Array.from({ length: fieldCount }, (_, index) => {
    const field = index + 1;
    const hasReferee = arbitratedFields.has(field);
    const slot = byField.get(field) || {};
    const cleanRole = value => {
      const text = String(value || '').trim();
      return text && roster.has(text) ? text : '';
    };
    return {
      field,
      home: cleanRole(slot.home),
      away: cleanRole(slot.away),
      referee: hasReferee ? cleanRole(slot.referee) : '',
      hasReferee,
    };
  });
}

function resolveLadderInitialSlotsForSource(source = state.draft) {
  const slots = getDraftLadderInitialSlotsForSource(source);
  const hasAssignedPlayer = slots.some(slot => slot.home || slot.away || slot.referee);
  if (hasAssignedPlayer) return slots;
  if (source?.ladderPlacementMode === 'manual') return slots;
  return buildAutomaticLadderInitialSlots(getLadderPlayerPoolForSource(source), source, false);
}

function getLadderPlacementValidation(source = state.draft) {
  const players = getLadderPlayerPoolForSource(source);
  const slots = resolveLadderInitialSlotsForSource(source);
  const roster = new Set(players);
  const seen = new Map();
  const duplicates = [];
  const unknown = [];
  const partialFields = [];
  const requiredArbitratedFields = normalizeLadderArbitratedFieldsForSource(source);

  slots.forEach(slot => {
    const roles = slot.hasReferee ? ['home', 'away', 'referee'] : ['home', 'away'];
    const values = roles.map(role => String(slot[role] || '').trim()).filter(Boolean);
    values.forEach(name => {
      if (!roster.has(name)) unknown.push(name);
      const previous = seen.get(name);
      if (previous) {
        duplicates.push(name);
      } else {
        seen.set(name, { field: slot.field });
      }
    });
    const filledCount = values.length;
    const requiredCount = roles.length;
    if (slot.hasReferee) {
      if (filledCount !== 0 && filledCount !== requiredCount) partialFields.push(slot.field);
      if (filledCount !== requiredCount) partialFields.push(slot.field);
    } else if (filledCount !== 0 && filledCount !== requiredCount) {
      partialFields.push(slot.field);
    }
  });

  const uniquePartialFields = [...new Set(partialFields)].sort((left, right) => left - right);
  const assigned = [...seen.keys()];
  const unplaced = players.filter(name => !seen.has(name));
  return {
    valid: duplicates.length === 0 && unknown.length === 0 && uniquePartialFields.length === 0,
    players,
    slots,
    assigned,
    unplaced,
    duplicates: [...new Set(duplicates)],
    unknown: [...new Set(unknown)],
    partialFields: uniquePartialFields,
    arbitratedFields: requiredArbitratedFields,
  };
}

function persistDraftLadderSlots(slots) {
  state.draft.ladderInitialSlots = (slots || []).map(slot => ({
    field: Number(slot.field),
    home: String(slot.home || '').trim(),
    away: String(slot.away || '').trim(),
    referee: String(slot.referee || '').trim(),
  }));
}

function applyDraftLadderPlacementMode(mode = 'auto') {
  const players = getLadderPlayerPoolForSource(state.draft);
  if (mode === 'manual') {
    persistDraftLadderSlots(buildEmptyLadderInitialSlots(state.draft));
    state.draft.ladderPlacementMode = 'manual';
    return;
  }
  if (mode === 'random') {
    persistDraftLadderSlots(buildRandomLadderInitialSlots(players, state.draft));
    state.draft.ladderPlacementMode = 'random';
    return;
  }
  persistDraftLadderSlots(buildAutomaticLadderInitialSlots(players, state.draft, mode === 'alpha'));
  state.draft.ladderPlacementMode = mode === 'alpha' ? 'alpha' : 'auto';
}

function resetDraftLadderInitialSlots(alphabetical = false) {
  applyDraftLadderPlacementMode(alphabetical ? 'alpha' : 'auto');
}

function setDraftLadderSlotValue(fieldNumber, role, nextValue) {
  const slots = getDraftLadderInitialSlotsForSource(state.draft).map(slot => ({ ...slot }));
  const target = slots.find(slot => slot.field === fieldNumber);
  if (!target || !['home', 'away', 'referee'].includes(role)) return;
  if (role === 'referee' && !target.hasReferee) return;
  const normalized = String(nextValue || '').trim();
  const currentValue = String(target[role] || '').trim();
  if (normalized && normalized !== currentValue) {
    slots.forEach(slot => {
      ['home', 'away', 'referee'].forEach(otherRole => {
        if (slot.field === fieldNumber && otherRole === role) return;
        if (String(slot[otherRole] || '').trim() === normalized) {
          slot[otherRole] = currentValue;
        }
      });
    });
  }
  target[role] = normalized;
  persistDraftLadderSlots(slots);
  state.draft.ladderPlacementMode = 'manual';
}

function getAvailableLadderPlayersForSlot(source = state.draft, fieldNumber, role) {
  const players = getLadderPlayerPoolForSource(source);
  const slots = getDraftLadderInitialSlotsForSource(source);
  const target = slots.find(slot => slot.field === fieldNumber);
  const currentValue = String(target?.[role] || '').trim();
  const usedElsewhere = new Set();
  slots.forEach(slot => {
    ['home', 'away', 'referee'].forEach(candidateRole => {
      if (slot.field === fieldNumber && candidateRole === role) return;
      const value = String(slot[candidateRole] || '').trim();
      if (value) usedElsewhere.add(value);
    });
  });
  return players.filter(name => name === currentValue || !usedElsewhere.has(name));
}

/* === Fonctions de génération récupérées/adaptées === */

function createRoundRobinPairs(teamNames, options = {}) {
  const working = [...teamNames];
  const needsBye = working.length % 2 === 1;
  if (needsBye) working.push('Exempt');
  const pivot = working[0];
  let rest = working.slice(1);
  const rounds = [];
  const totalRounds = working.length - 1;
  let previousReferee = null;
  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
    const current = [pivot, ...rest];
    const matches = [];
    const byes = [];
    for (let index = 0; index < current.length / 2; index += 1) {
      const home = current[index];
      const away = current[current.length - 1 - index];
      if (home === 'Exempt') {
        byes.push(away);
        continue;
      }
      if (away === 'Exempt') {
        byes.push(home);
        continue;
      }
      matches.push({
        id: buildMatchKey(roundIndex + 1, home, away),
        home,
        away,
      });
    }
    if (options.rotatingReferee) {
      const refereePool = byes.length ? [...byes] : (previousReferee ? [previousReferee] : []);
      matches.forEach((match, idx) => {
        match.referee = refereePool[idx] || null;
      });
      if (byes.length) previousReferee = byes[byes.length - 1];
    }
    rounds.push({ matches, byes });
    rest.unshift(rest.pop());
  }
  return rounds;
}

function assembleSchedule(entries, teams, options, metaExtras) {
  const fieldCount = clampNumber(Number(options.fields) || 1, 1, 20, 1);
  const rotations = [];
  let rotationNumber = 1;
  let totalMatches = 0;
  let clock = parseTime(options.startTime);
  entries.forEach(entry => {
    const chunked = [];
    for (let index = 0; index < entry.matches.length; index += fieldCount) {
      chunked.push(entry.matches.slice(index, index + fieldCount));
    }
    if (!chunked.length) {
      chunked.push([]);
    }
    chunked.forEach(slice => {
      const startLabel = clock == null ? '' : formatTimeLabel(clock);
      const endLabel = clock == null ? '' : formatTimeLabel(clock + Number(options.duration || 7));
      const preparedMatches = slice.map((match, matchIndex) => {
        totalMatches += 1;
        return {
          ...match,
          field: match.field || matchIndex + 1,
          phase: match.phase || entry.phase || metaExtras.format,
          groupId: match.groupId || entry.groupId || null,
          groupLabel: match.groupLabel || entry.groupLabel || null,
        };
      });
      rotations.push({
        number: rotationNumber,
        title: entry.title || `Rotation ${rotationNumber}`,
        phase: entry.phase || metaExtras.format,
        groupId: entry.groupId || null,
        groupLabel: entry.groupLabel || null,
        startLabel,
        endLabel,
        matches: preparedMatches,
        byes: [...(entry.byes || [])],
        byeAssignments: Array.isArray(entry.byeAssignments) ? cloneData(entry.byeAssignments) : [],
      });
      rotationNumber += 1;
      if (clock != null) {
        clock += Number(options.duration || 7);
      }
    });
  });
  return {
    format: metaExtras.format,
    rotations,
    teams: teams.map(name => ({ name })),
    groups: metaExtras.groups || [],
    finals: metaExtras.finals || null,
    meta: {
      format: metaExtras.format,
      formatLabel: metaExtras.formatLabel,
      teamCount: teams.length,
      matchCount: totalMatches,
      fieldCount,
      rotationCount: rotations.length,
      practiceType: options.practiceType,
      durationMinutes: Number(options.duration || 7),
    },
  };
}

function validateRotationCapacity(rotations, fieldCount, format = '') {
  const safeFieldCount = Math.max(1, Number(fieldCount) || 1);
  (rotations || []).forEach((rotation, index) => {
    const matches = Array.isArray(rotation?.matches) ? rotation.matches : [];
    if (matches.length > safeFieldCount) {
      console.warn(`[validateRotationCapacity] ${format || 'schedule'} rotation ${index + 1} contient ${matches.length} matchs pour ${safeFieldCount} terrain(s).`);
    }
    const fields = new Set();
    const participants = new Set();
    matches.forEach(match => {
      if (match.field != null) {
        if (fields.has(match.field)) {
          console.warn(`[validateRotationCapacity] ${format || 'schedule'} rotation ${index + 1} réutilise le terrain ${match.field}.`);
        }
        fields.add(match.field);
      }
      const names = [
        match.home,
        match.away,
        ...(match.homePlayers || []),
        ...(match.awayPlayers || []),
      ].filter(Boolean);
      names.forEach(name => {
        if (participants.has(name)) {
          console.warn(`[validateRotationCapacity] ${format || 'schedule'} rotation ${index + 1} duplique ${name}.`);
        }
        participants.add(name);
      });
    });
  });
}

function validateRotationRoles(rotation, format = '') {
  const matches = Array.isArray(rotation?.matches) ? rotation.matches : [];
  const byeAssignments = Array.isArray(rotation?.byeAssignments) ? rotation.byeAssignments : [];
  const activeParticipants = new Set();
  const embeddedReferees = [];
  matches.forEach(match => {
    [
      match.home,
      match.away,
      ...(match.homePlayers || []),
      ...(match.awayPlayers || []),
    ].filter(Boolean).forEach(name => activeParticipants.add(name));
    [match.referee, match.ladderReferee].filter(Boolean).forEach(name => embeddedReferees.push(name));
  });
  let invalidRefereeCount = 0;
  let invalidTableCount = 0;
  let duplicateRoleCount = 0;
  const roleOwners = new Set();
  embeddedReferees.forEach(name => {
    if (roleOwners.has(name)) {
      duplicateRoleCount += 1;
      console.warn(`[validateRotationRoles] ${format || 'rotation'} ${rotation.number || '?'} attribue plusieurs rôles à ${name}.`);
    }
    roleOwners.add(name);
    if (activeParticipants.has(name)) {
      invalidRefereeCount += 1;
      console.warn(`[validateRotationRoles] ${format || 'rotation'} ${rotation.number || '?'} assigne arbitre invalide : ${name} joue déjà dans cette rotation.`);
    }
  });
  byeAssignments.forEach(entry => {
    if (!entry?.name || !entry?.role) return;
    if (roleOwners.has(entry.name)) {
      duplicateRoleCount += 1;
      console.warn(`[validateRotationRoles] ${format || 'rotation'} ${rotation.number || '?'} attribue plusieurs rôles à ${entry.name}.`);
    }
    roleOwners.add(entry.name);
    if (activeParticipants.has(entry.name)) {
      if (entry.role === 'Arbitre') {
        invalidRefereeCount += 1;
        console.warn(`[validateRotationRoles] ${format || 'rotation'} ${rotation.number || '?'} assigne arbitre invalide : ${entry.name} joue déjà dans cette rotation.`);
      }
      if (entry.role === 'Table') {
        invalidTableCount += 1;
        console.warn(`[validateRotationRoles] ${format || 'rotation'} ${rotation.number || '?'} assigne table invalide : ${entry.name} joue déjà dans cette rotation.`);
      }
    }
  });
  return { invalidRefereeCount, invalidTableCount, duplicateRoleCount };
}

function validateRotationByes(rotation, participants = [], format = '') {
  const allParticipants = Array.isArray(participants) ? [...new Set(participants.filter(Boolean))] : [];
  const matches = Array.isArray(rotation?.matches) ? rotation.matches : [];
  const unresolvedMatches = matches.some(match => match.seedHome || match.seedAway || match.placeholderHome || match.placeholderAway);
  const activeParticipants = new Set();
  const sociallyAssignedParticipants = new Set();
  matches.forEach(match => {
    [
      match.home,
      match.away,
      ...(match.homePlayers || []),
      ...(match.awayPlayers || []),
    ].filter(Boolean).forEach(name => activeParticipants.add(name));
    [match.referee, match.ladderReferee].filter(Boolean).forEach(name => sociallyAssignedParticipants.add(name));
  });
  const byeParticipants = new Set((rotation?.byes || []).filter(Boolean));
  const invalidByeNames = new Set();
  const bothActiveAndByeNames = new Set();
  const invalidRoleNames = new Set();

  byeParticipants.forEach(name => {
    if (activeParticipants.has(name)) {
      bothActiveAndByeNames.add(name);
      invalidByeNames.add(name);
      console.warn(`[validateRotationByes] ${format || 'rotation'} ${rotation.number || '?'} : ${name} est à la fois en match et au repos.`);
    }
  });

  if (!unresolvedMatches && allParticipants.length) {
    allParticipants.forEach(name => {
      if (!activeParticipants.has(name) && !byeParticipants.has(name) && !sociallyAssignedParticipants.has(name)) {
        invalidByeNames.add(name);
        console.warn(`[validateRotationByes] ${format || 'rotation'} ${rotation.number || '?'} : repos/byes manquant pour ${name}.`);
      }
    });
  }

  (rotation?.byeAssignments || []).forEach(entry => {
    if (!entry?.name) return;
    sociallyAssignedParticipants.add(entry.name);
    if (activeParticipants.has(entry.name)) {
      invalidRoleNames.add(entry.name);
      console.warn(`[validateRotationByes] ${format || 'rotation'} ${rotation.number || '?'} : rôle social invalide pour ${entry.name}, déjà en match.`);
    }
    if (!byeParticipants.has(entry.name)) {
      invalidByeNames.add(entry.name);
      console.warn(`[validateRotationByes] ${format || 'rotation'} ${rotation.number || '?'} : ${entry.name} a un rôle de repos mais n'est pas dans byes.`);
    }
  });

  return {
    activeParticipants: [...activeParticipants],
    byeParticipants: [...byeParticipants],
    invalidByeCount: invalidByeNames.size,
    playerBothActiveAndByeCount: bothActiveAndByeNames.size,
    invalidRoleFromActiveCount: invalidRoleNames.size,
  };
}

function computeParticipationStats(schedule, participants = []) {
  const names = Array.isArray(participants) && participants.length
    ? [...new Set(participants.filter(Boolean))]
    : ((schedule?.rotatingTeams?.players || schedule?.teams || [])
      .map(entry => typeof entry === 'string' ? entry : entry?.name)
      .filter(Boolean));
  const playedByParticipant = Object.fromEntries(names.map(name => [name, 0]));
  (schedule?.rotations || []).forEach(rotation => {
    (rotation?.matches || []).forEach(match => {
      [
        match.home,
        match.away,
        ...(match.homePlayers || []),
        ...(match.awayPlayers || []),
      ].filter(Boolean).forEach(name => {
        if (!(name in playedByParticipant)) playedByParticipant[name] = 0;
        playedByParticipant[name] += 1;
      });
    });
  });
  const values = Object.values(playedByParticipant);
  const minMatches = values.length ? Math.min(...values) : 0;
  const maxMatches = values.length ? Math.max(...values) : 0;
  return {
    playedByParticipant,
    minMatches,
    maxMatches,
    spread: maxMatches - minMatches,
  };
}

function validateParticipationFairness(schedule, participants = [], options = {}) {
  const stats = computeParticipationStats(schedule, participants);
  const format = schedule?.format || '';
  const isBalancedMode = ['round-robin', 'rotating-teams', 'swiss'].includes(format);
  const warnings = [];
  if (isBalancedMode && stats.spread > 1) {
    const message = `${format} présente un écart de participation de ${stats.spread} match(s) entre joueurs/équipes.`;
    warnings.push(message);
    console.warn(`[validateParticipationFairness] ${message}`);
  } else if (isBalancedMode && stats.spread === 1) {
    const message = `${format} présente une légère imperfection d'équité (écart de 1 match).`;
    warnings.push(message);
    console.warn(`[validateParticipationFairness] ${message}`);
  }
  if (stats.minMatches === 0 && stats.maxMatches > 1 && isBalancedMode) {
    const message = `${format} laisse au moins un participant sans match alors que d'autres en ont ${stats.maxMatches}.`;
    warnings.push(message);
    console.warn(`[validateParticipationFairness] ${message}`);
  }
  return {
    ...stats,
    valid: warnings.length === 0,
    warnings,
  };
}

function validateTournamentSchedule(schedule, options = {}) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
  };
  if (!schedule || !Array.isArray(schedule.rotations)) {
    result.valid = false;
    result.errors.push('Schedule invalide : rotations absentes.');
    console.error('[validateTournamentSchedule] Schedule invalide : rotations absentes.');
    return result;
  }
  const uniqueIds = validateUniqueMatchIds(schedule);
  if (!uniqueIds.valid) {
    result.valid = false;
    result.errors.push(...uniqueIds.errors);
  }
  const fieldCount = Math.max(1, Number(options.fields ?? schedule.meta?.fieldCount) || 1);
  const allParticipants = (schedule.rotatingTeams?.players || schedule.teams || [])
    .map(entry => typeof entry === 'string' ? entry : entry?.name)
    .filter(Boolean);
  const enabledRoles = getEnabledRolesFromOptions(options);
  const unavailableRoleRotations = {
    Arbitre: [],
    Table: [],
  };
  const knownMatchIds = new Set(schedule.rotations.flatMap(rotation => (rotation.matches || []).map(match => match.id).filter(Boolean)));
  Object.entries(options.scores || {}).forEach(([matchId, record]) => {
    if (!knownMatchIds.has(matchId)) {
      const message = `score attaché à un match inexistant : ${matchId}.`;
      result.valid = false;
      result.errors.push(message);
      console.error(`[validateTournamentSchedule] ${message}`);
      return;
    }
    if (record && typeof record === 'object') {
      const hasScores = Number.isFinite(record.home) && Number.isFinite(record.away);
      const isValidated = record.confirmed === true || record.validated === true;
      if (hasScores && !isValidated) {
        const message = `score numérique non confirmé pour ${matchId}.`;
        result.warnings.push(message);
      }
    }
  });
  schedule.rotations.forEach((rotation, rotationIndex) => {
    const label = `${schedule.format || 'schedule'} rotation ${rotationIndex + 1}`;
    const matches = Array.isArray(rotation?.matches) ? rotation.matches : [];
    if (matches.length > fieldCount) {
      const message = `${label} contient ${matches.length} matchs pour ${fieldCount} terrain(s).`;
      result.valid = false;
      result.errors.push(message);
      console.error(`[validateTournamentSchedule] ${message}`);
    }
    const seenParticipants = new Set();
    const usedFields = new Set();
    matches.forEach((match, matchIndex) => {
      if (match.field != null) {
        if (usedFields.has(match.field)) {
          const message = `${label} duplique le terrain ${match.field}.`;
          result.valid = false;
          result.errors.push(message);
          console.error(`[validateTournamentSchedule] ${message}`);
        }
        usedFields.add(match.field);
      }
      const homeSide = [
        match.home,
        ...(match.homePlayers || []),
      ].filter(Boolean);
      const awaySide = [
        match.away,
        ...(match.awayPlayers || []),
      ].filter(Boolean);
      if (match.home && match.away && match.home === match.away) {
        const message = `${label} match ${matchIndex + 1} oppose ${match.home} à lui-même.`;
        result.valid = false;
        result.errors.push(message);
        console.error(`[validateTournamentSchedule] ${message}`);
      }
      const overlap = homeSide.filter(name => awaySide.includes(name));
      overlap.forEach(name => {
        const message = `${label} match ${matchIndex + 1} oppose ${name} à lui-même.`;
        result.valid = false;
        result.errors.push(message);
        console.error(`[validateTournamentSchedule] ${message}`);
      });
      [...homeSide, ...awaySide].forEach(name => {
        if (seenParticipants.has(name)) {
          const message = `${label} duplique ${name} dans la même rotation.`;
          result.valid = false;
          result.errors.push(message);
          console.error(`[validateTournamentSchedule] ${message}`);
        }
        seenParticipants.add(name);
      });
    });
    const roleOwners = new Set();
    matches.forEach(match => {
      [match.referee, match.ladderReferee].filter(Boolean).forEach(name => {
        if (seenParticipants.has(name)) {
          const message = `${label} assigne arbitre invalide : ${name} joue déjà.`;
          result.valid = false;
          result.errors.push(message);
          console.error(`[validateTournamentSchedule] ${message}`);
        }
        if (roleOwners.has(name)) {
          const message = `${label} attribue plusieurs rôles sociaux à ${name}.`;
          result.valid = false;
          result.errors.push(message);
          console.error(`[validateTournamentSchedule] ${message}`);
        }
        roleOwners.add(name);
      });
    });
    (rotation.byeAssignments || []).forEach(entry => {
      if (!entry?.name || !entry?.role) return;
      if (seenParticipants.has(entry.name) && entry.role === 'Arbitre') {
        const message = `${label} assigne arbitre invalide : ${entry.name} joue déjà.`;
        result.valid = false;
        result.errors.push(message);
        console.error(`[validateTournamentSchedule] ${message}`);
      }
      if (seenParticipants.has(entry.name) && entry.role === 'Table') {
        const message = `${label} assigne table invalide : ${entry.name} joue déjà.`;
        result.valid = false;
        result.errors.push(message);
        console.error(`[validateTournamentSchedule] ${message}`);
      }
      if (roleOwners.has(entry.name)) {
        const message = `${label} attribue plusieurs rôles sociaux à ${entry.name}.`;
        result.valid = false;
        result.errors.push(message);
        console.error(`[validateTournamentSchedule] ${message}`);
      }
      roleOwners.add(entry.name);
    });
    if (enabledRoles.includes('Arbitre')) {
      const hasReferee = matches.some(match => match.referee || match.ladderReferee) || (rotation.byeAssignments || []).some(entry => entry.role === 'Arbitre');
      if (!hasReferee) {
        unavailableRoleRotations.Arbitre.push(rotationIndex + 1);
      }
    }
    if (enabledRoles.includes('Table')) {
      const hasTable = (rotation.byeAssignments || []).some(entry => entry.role === 'Table');
      const canProvideTable = schedule.format !== 'ladder' || (Array.isArray(rotation.byes) && rotation.byes.length > 0);
      if (!hasTable && canProvideTable) {
        unavailableRoleRotations.Table.push(rotationIndex + 1);
      }
    }
    const roleCounts = validateRotationRoles(rotation, schedule.format || '');
    if (roleCounts.invalidRefereeCount || roleCounts.invalidTableCount || roleCounts.duplicateRoleCount) {
      result.valid = false;
    }
    const byeCounts = validateRotationByes(rotation, allParticipants, schedule.format || '');
    if (byeCounts.invalidByeCount || byeCounts.playerBothActiveAndByeCount || byeCounts.invalidRoleFromActiveCount) {
      result.valid = false;
    }
  });
  Object.entries(unavailableRoleRotations).forEach(([role, rotations]) => {
    if (!rotations.length) return;
    const listedRotations = rotations.length <= 6
      ? rotations.join(', ')
      : `${rotations.slice(0, 6).join(', ')}, …`;
    result.warnings.push(
      `${schedule.format} : ${role} non attribuable sur ${rotations.length} rotation(s) (${listedRotations}) : aucun participant inactif disponible pour ce rôle.`
    );
  });
  const fairness = validateParticipationFairness(schedule, allParticipants, options);
  result.warnings.push(...fairness.warnings);
  if (!result.valid) {
    console.error(`[validateTournamentSchedule] Planning invalide : ${result.errors.join(' | ')}`);
  }
  if (result.warnings.length) {
    console.warn(`[validateTournamentSchedule] Warnings : ${result.warnings.join(' | ')}`);
  }
  return result;
}

function syncDynamicRotationCount(schedule) {
  if (!schedule?.meta || !Array.isArray(schedule.rotations)) return;
  if (schedule.format === 'swiss' || schedule.format === 'ladder') {
    schedule.meta.rotationCount = schedule.rotations.length;
  }
}

function runScheduleStressAudit(config = {}) {
  const participantMin = clampNumber(Number(config.participantMin) || 4, 4, 48, 4);
  const participantMax = clampNumber(Number(config.participantMax) || 48, participantMin, 48, 48);
  const fieldMin = clampNumber(Number(config.fieldMin) || 1, 1, 20, 1);
  const fieldMax = clampNumber(Number(config.fieldMax) || 20, fieldMin, 20, 20);
  const refereeValues = Array.isArray(config.refereeValues) && config.refereeValues.length ? config.refereeValues : [false, true];
  const tableValues = Array.isArray(config.tableValues) && config.tableValues.length ? config.tableValues : [false, true];
  const cases = [
    { sport: 'sport-co', format: 'round-robin' },
    { sport: 'sport-co', format: 'groups-finals' },
    { sport: 'sport-co', format: 'rotating-teams' },
    { sport: 'raquette', format: 'round-robin' },
    { sport: 'raquette', format: 'swiss' },
    { sport: 'raquette', format: 'ladder' },
    { sport: 'raquette', format: 'challenge' },
  ];
  const summary = {
    totalConfigs: 0,
    validConfigs: 0,
    invalidConfigs: 0,
    topErrors: [],
    topWarnings: [],
    brokenFormats: {},
    examples: [],
    cases: [],
  };
  const errorCounts = new Map();
  const warningCounts = new Map();
  const exampleByError = new Map();
  const originalWarn = console.warn;
  const originalError = console.error;
  const capturedLogs = [];
  console.warn = (...args) => {
    capturedLogs.push({ level: 'warn', message: args.map(String).join(' ') });
  };
  console.error = (...args) => {
    capturedLogs.push({ level: 'error', message: args.map(String).join(' ') });
  };
  try {
    for (const entry of cases) {
      for (let participantCount = participantMin; participantCount <= participantMax; participantCount += 1) {
        for (let fields = fieldMin; fields <= fieldMax; fields += 1) {
          for (const rotatingReferee of refereeValues) {
            for (const scoreTable of tableValues) {
              const teamNames = Array.from({ length: participantCount }, (_, index) => `${entry.sport === 'sport-co' ? 'Equipe' : 'Joueur'} ${index + 1}`);
              const options = {
                sport: entry.sport,
                format: entry.format,
                fields,
                rotatingReferee: Boolean(rotatingReferee),
                scoreTable: Boolean(scoreTable),
                duration: 7,
                practiceType: 'competition',
                teamSize: 2,
                organization: 'pools',
                challengeRange: 5,
                poolSize: 4,
              };
              const auditCase = {
                sport: entry.sport,
                format: entry.format,
                participantCount,
                fields,
                rotatingReferee: Boolean(rotatingReferee),
                scoreTable: Boolean(scoreTable),
              };
              summary.totalConfigs += 1;
              try {
                const schedule = generateSchedule(teamNames, options);
                const validation = validateTournamentSchedule(schedule, options);
                if (validation.valid) {
                  summary.validConfigs += 1;
                } else {
                  summary.invalidConfigs += 1;
                  summary.brokenFormats[entry.format] = (summary.brokenFormats[entry.format] || 0) + 1;
                }
                const effectiveErrors = validation.errors.length
                  ? validation.errors
                  : (validation.valid ? [] : ['Planning invalide sans erreur structurée explicite']);
                effectiveErrors.forEach(message => {
                  errorCounts.set(message, (errorCounts.get(message) || 0) + 1);
                  const existing = exampleByError.get(message);
                  if (!existing || participantCount < existing.participantCount || (participantCount === existing.participantCount && fields < existing.fields)) {
                    exampleByError.set(message, { ...auditCase, message });
                  }
                });
                validation.warnings.forEach(message => {
                  warningCounts.set(message, (warningCounts.get(message) || 0) + 1);
                });
              } catch (error) {
                summary.invalidConfigs += 1;
                summary.brokenFormats[entry.format] = (summary.brokenFormats[entry.format] || 0) + 1;
                const message = `Exception: ${error?.message || error}`;
                errorCounts.set(message, (errorCounts.get(message) || 0) + 1);
                const existing = exampleByError.get(message);
                if (!existing || participantCount < existing.participantCount || (participantCount === existing.participantCount && fields < existing.fields)) {
                  exampleByError.set(message, { ...auditCase, message });
                }
              }
            }
          }
        }
      }
    }
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
  summary.topErrors = [...errorCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([message, count]) => ({ message, count }));
  summary.topWarnings = [...warningCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([message, count]) => ({ message, count }));
  summary.examples = [...exampleByError.values()]
    .sort((left, right) => left.participantCount - right.participantCount || left.fields - right.fields)
    .slice(0, 10);
  summary.cases = capturedLogs.slice(0, 50);
  originalWarn('[runScheduleStressAudit] Résumé', {
    totalConfigs: summary.totalConfigs,
    validConfigs: summary.validConfigs,
    invalidConfigs: summary.invalidConfigs,
    topErrors: summary.topErrors,
    topWarnings: summary.topWarnings,
    brokenFormats: Object.entries(summary.brokenFormats).sort((left, right) => right[1] - left[1]),
    examples: summary.examples,
  });
  return summary;
}

function buildDeterministicMatchId(rotation, match, fallbackIndex = 0) {
  const phase = match?.phase || rotation?.phase || 'match';
  const rotationKey = rotation?.number || fallbackIndex + 1;
  const homeKey = match?.home
    || (Array.isArray(match?.homePlayers) ? match.homePlayers.join('-') : '')
    || (match?.swissP1Id ? `p${match.swissP1Id}` : '')
    || 'home';
  const awayKey = match?.away
    || (Array.isArray(match?.awayPlayers) ? match.awayPlayers.join('-') : '')
    || (match?.swissP2Id ? `p${match.swissP2Id}` : '')
    || 'away';
  const groupKey = match?.groupId || match?.poolId || '';
  return `m-${rotationKey}-${phase}-${encodeURIComponent(groupKey)}-${encodeURIComponent(homeKey)}-${encodeURIComponent(awayKey)}`;
}

function ensureStableMatchIds(schedule) {
  if (!schedule || !Array.isArray(schedule.rotations)) return schedule;
  const seen = new Map();
  schedule.rotations.forEach((rotation, rotationIndex) => {
    if (!Array.isArray(rotation?.matches)) return;
    rotation.matches.forEach((match, matchIndex) => {
      let nextId = match?.id || buildDeterministicMatchId(rotation, match, matchIndex);
      if (!match?.id) {
        match.id = nextId;
      }
      if (seen.has(nextId)) {
        const previous = seen.get(nextId);
        console.error(`[validateUniqueMatchIds] doublon détecté pour ${nextId} entre rotation ${previous.rotation} match ${previous.match} et rotation ${rotation.number || rotationIndex + 1} match ${matchIndex + 1}.`);
        let suffix = 2;
        while (seen.has(`${nextId}--${suffix}`)) suffix += 1;
        nextId = `${nextId}--${suffix}`;
        match.id = nextId;
      }
      seen.set(match.id, {
        rotation: rotation.number || rotationIndex + 1,
        match: matchIndex + 1,
      });
    });
  });
  return schedule;
}

function validateUniqueMatchIds(schedule) {
  const result = {
    valid: true,
    errors: [],
  };
  if (!schedule || !Array.isArray(schedule.rotations)) return result;
  const seen = new Map();
  schedule.rotations.forEach((rotation, rotationIndex) => {
    (rotation.matches || []).forEach((match, matchIndex) => {
      if (!match?.id) {
        const message = `rotation ${rotation.number || rotationIndex + 1} match ${matchIndex + 1} sans id`;
        result.valid = false;
        result.errors.push(message);
        console.error(`[validateUniqueMatchIds] ${message}.`);
        return;
      }
      if (seen.has(match.id)) {
        const previous = seen.get(match.id);
        const message = `doublon ${match.id} entre rotation ${previous.rotation} match ${previous.match} et rotation ${rotation.number || rotationIndex + 1} match ${matchIndex + 1}`;
        result.valid = false;
        result.errors.push(message);
        console.error(`[validateUniqueMatchIds] ${message}.`);
        return;
      }
      seen.set(match.id, {
        rotation: rotation.number || rotationIndex + 1,
        match: matchIndex + 1,
      });
    });
  });
  return result;
}

function splitRotationIntoWaves(rotation, fieldCount, enabledRoles = null) {
  const safeFieldCount = Math.max(1, Number(fieldCount) || 1);
  const matches = Array.isArray(rotation?.matches) ? rotation.matches : [];
  const inferredRoles = Array.isArray(enabledRoles) && enabledRoles.length
    ? enabledRoles
    : [...new Set((rotation?.byeAssignments || []).map(entry => entry?.role).filter(role => role && role !== 'Spectateur actif'))];
  const fullParticipantSet = new Set([
    ...(rotation?.byes || []),
    ...matches.flatMap(match => [
      match.home,
      match.away,
      ...(match.homePlayers || []),
      ...(match.awayPlayers || []),
    ].filter(Boolean)),
  ]);
  const buildWave = slice => {
    const activeParticipants = new Set(slice.flatMap(match => [
      match.home,
      match.away,
      ...(match.homePlayers || []),
      ...(match.awayPlayers || []),
    ].filter(Boolean)));
    const embeddedRoleOwners = new Set(slice.flatMap(match => [
      match.referee,
      match.ladderReferee,
    ].filter(Boolean)));
    const waveByes = [...fullParticipantSet].filter(name => !activeParticipants.has(name));
    const preservedAssignments = [];
    const preservedNames = new Set(embeddedRoleOwners);
    (rotation?.byeAssignments || []).forEach(entry => {
      if (!entry?.name || !entry?.role) return;
      if (!waveByes.includes(entry.name)) return;
      if (activeParticipants.has(entry.name)) return;
      if (embeddedRoleOwners.has(entry.name)) return;
      if (preservedNames.has(entry.name)) return;
      preservedAssignments.push({ ...entry });
      preservedNames.add(entry.name);
    });
    const remainingCandidates = waveByes.filter(name => !preservedNames.has(name));
    const generatedAssignments = assignRolesForByes(remainingCandidates, inferredRoles);
    const wave = {
      ...rotation,
      matches: slice.map((match, index) => ({ ...match, field: index + 1 })),
      byes: waveByes,
      byeAssignments: [...preservedAssignments, ...generatedAssignments],
    };
    validateRotationByes(wave, [...fullParticipantSet], rotation?.phase || '');
    return wave;
  };
  if (matches.length <= safeFieldCount) {
    const wave = buildWave(matches);
    validateRotationRoles(wave, rotation?.phase || '');
    return [wave];
  }
  const waves = [];
  for (let index = 0; index < matches.length; index += safeFieldCount) {
    const slice = matches.slice(index, index + safeFieldCount);
    const wave = buildWave(slice);
    validateRotationRoles(wave, rotation?.phase || '');
    waves.push(wave);
  }
  return waves;
}

function buildSinglePoolSchedule(teams, options) {
  const rounds = createRoundRobinPairs(teams, options);
  const enabledRoles = getEnabledRolesFromOptions(options);
  const fieldCount = clampNumber(Number(options.fields) || 1, 1, 20, 1);
  const rotations = [];
  let rotationNumber = 1;
  let totalMatches = 0;
  let clock = parseTime(options.startTime);
  rounds.forEach((round, index) => {
    const waves = splitRotationIntoWaves({
      number: index + 1,
      title: `Rotation ${index + 1}`,
      phase: 'single',
      matches: round.matches.map(match => ({ ...match })),
      byes: [...round.byes],
      byeAssignments: assignRolesForByes(round.byes, enabledRoles),
    }, fieldCount, enabledRoles);
    waves.forEach(wave => {
      const startLabel = clock == null ? '' : formatTimeLabel(clock);
      const endLabel = clock == null ? '' : formatTimeLabel(clock + Number(options.duration || 7));
      const preparedMatches = (wave.matches || []).map((match, matchIndex) => {
        totalMatches += 1;
        return {
          ...match,
          field: match.field || matchIndex + 1,
          phase: match.phase || 'single',
          groupId: match.groupId || null,
          groupLabel: match.groupLabel || null,
        };
      });
      rotations.push({
        ...wave,
        number: rotationNumber,
        title: `Rotation ${rotationNumber}`,
        startLabel,
        endLabel,
        matches: preparedMatches,
      });
      rotationNumber += 1;
      if (clock != null) {
        clock += Number(options.duration || 7);
      }
    });
  });
  return {
    format: 'round-robin',
    rotations,
    teams: teams.map(name => ({ name })),
    groups: [],
    meta: {
      format: 'round-robin',
      formatLabel: TOURNAMENT_MODES['round-robin'].label,
      teamCount: teams.length,
      matchCount: totalMatches,
      fieldCount,
      rotationCount: rotations.length,
      practiceType: options.practiceType,
      durationMinutes: Number(options.duration || 7),
    },
  };
}

function distributeIntoGroups(teamNames, options = {}) {
  if (!Array.isArray(teamNames) || !teamNames.length) return [];
  const teams = [...teamNames];
  const requestedGroups = Number(options.targetGroups);
  const targetGroups =
    Number.isFinite(requestedGroups) && requestedGroups > 0 ? clampNumber(requestedGroups, 2, 4, requestedGroups) : null;
  const minGroups = options.finals ? Math.min(2, teams.length) : teams.length >= 4 ? Math.min(2, teams.length) : 1;
  const maxGroups = options.finals ? Math.min(4, teams.length) : Math.min(6, teams.length);
  const preferSize = 4;
  const candidates = [];
  for (let groupCount = minGroups; groupCount <= Math.max(minGroups, maxGroups); groupCount += 1) {
    const base = Math.floor(teams.length / groupCount);
    if (!base) continue;
    const remainder = teams.length % groupCount;
    const sizes = Array(groupCount).fill(base);
    for (let index = 0; index < remainder; index += 1) {
      sizes[index] += 1;
    }
    if (sizes.some(size => size < 2)) continue;
    const maxSize = Math.max(...sizes);
    const minSize = Math.min(...sizes);
    const imbalance = maxSize - minSize;
    const penalty = sizes.reduce((sum, size) => sum + Math.abs(size - preferSize), 0) + imbalance * (imbalance > 1 ? 3 : 1);
    candidates.push({ groupCount, sizes, imbalance, penalty });
  }
  if (!candidates.length) {
    return [{ id: 'group-0', label: 'Groupe A', teams }];
  }
  const balanced = candidates.filter(entry => entry.imbalance <= 1);
  const pool = balanced.length ? balanced : candidates;
  pool.sort((left, right) => {
    if (left.penalty !== right.penalty) return left.penalty - right.penalty;
    return left.groupCount - right.groupCount;
  });
  if (targetGroups) {
    const idx = pool.findIndex(entry => entry.groupCount === targetGroups);
    if (idx > 0) {
      const [preferred] = pool.splice(idx, 1);
      pool.unshift(preferred);
    }
  }
  const selected = pool[0];
  const result = [];
  let cursor = 0;
  selected.sizes.forEach((size, index) => {
    const label = `Groupe ${String.fromCharCode(65 + index)}`;
    result.push({
      id: `group-${index}`,
      label,
      teams: teams.slice(cursor, cursor + size),
    });
    cursor += size;
  });
  return result;
}

function buildFinalEntries(groups) {
  if (groups.length < 2) return [];
  return [
    {
      phase: 'finals',
      title: 'Demi-finale 1',
      matches: [
        {
          id: 'sf1',
          seedHome: { type: 'group', groupId: groups[0].id, position: 1 },
          seedAway: { type: 'group', groupId: groups[1].id, position: 2 },
          placeholderHome: `1er ${groups[0].label}`,
          placeholderAway: `2e ${groups[1].label}`,
        },
      ],
    },
    {
      phase: 'finals',
      title: 'Demi-finale 2',
      matches: [
        {
          id: 'sf2',
          seedHome: { type: 'group', groupId: groups[1].id, position: 1 },
          seedAway: { type: 'group', groupId: groups[0].id, position: 2 },
          placeholderHome: `1er ${groups[1].label}`,
          placeholderAway: `2e ${groups[0].label}`,
        },
      ],
    },
    {
      phase: 'finals',
      title: 'Match pour la 3e place',
      matches: [
        {
          id: 'small-final',
          seedHome: { type: 'matchLoser', matchId: 'sf1', label: 'Demi-finale 1' },
          seedAway: { type: 'matchLoser', matchId: 'sf2', label: 'Demi-finale 2' },
          placeholderHome: 'Perdant demi-finale 1',
          placeholderAway: 'Perdant demi-finale 2',
        },
      ],
    },
    {
      phase: 'finals',
      title: 'Finale',
      matches: [
        {
          id: 'final',
          seedHome: { type: 'matchWinner', matchId: 'sf1', label: 'Demi-finale 1' },
          seedAway: { type: 'matchWinner', matchId: 'sf2', label: 'Demi-finale 2' },
          placeholderHome: 'Vainqueur demi-finale 1',
          placeholderAway: 'Vainqueur demi-finale 2',
        },
      ],
    },
  ];
}

function buildGroupedSchedule(groups, allTeams, options, extras = {}) {
  const groupedRounds = groups.map(group => ({
    ...group,
    rounds: createRoundRobinPairs(group.teams, options),
  }));
  const entries = [];
  const maxRounds = Math.max(...groupedRounds.map(group => group.rounds.length));
  for (let roundIndex = 0; roundIndex < maxRounds; roundIndex += 1) {
    const matches = [];
    const byes = [];
    groupedRounds.forEach(group => {
      const round = group.rounds[roundIndex];
      if (!round) {
        byes.push(...group.teams);
        return;
      }
      round.matches.forEach(match => {
        matches.push({
          ...match,
          phase: 'groups',
          groupId: group.id,
          groupLabel: group.label,
        });
      });
      round.byes.forEach(name => byes.push(name));
    });
    entries.push({
      phase: 'groups',
      title: `Rotation ${entries.length + 1}`,
      matches,
      byes,
      byeAssignments: assignRolesForByes(byes, getEnabledRolesFromOptions(options)),
    });
  }
  if (extras.finals && groups.length >= 2) {
    entries.push(...buildFinalEntries(groups));
  }
  const fieldCount = clampNumber(Number(options.fields) || 1, 1, 20, 1);
  const enabledRoles = getEnabledRolesFromOptions(options);
  const rotations = [];
  let rotationNumber = 1;
  let totalMatches = 0;
  let clock = parseTime(options.startTime);
  entries.forEach(entry => {
    const waves = entry.phase === 'groups'
      ? splitRotationIntoWaves({
          number: rotationNumber,
          title: entry.title || `Rotation ${rotationNumber}`,
          phase: entry.phase,
          groupId: entry.groupId || null,
          groupLabel: entry.groupLabel || null,
          matches: entry.matches.map(match => ({ ...match })),
          byes: [...(entry.byes || [])],
          byeAssignments: Array.isArray(entry.byeAssignments) ? cloneData(entry.byeAssignments) : [],
        }, fieldCount, enabledRoles)
      : [{
          number: rotationNumber,
          title: entry.title || `Rotation ${rotationNumber}`,
          phase: entry.phase,
          groupId: entry.groupId || null,
          groupLabel: entry.groupLabel || null,
          matches: entry.matches.map(match => ({ ...match })),
          byes: [...(entry.byes || [])],
          byeAssignments: Array.isArray(entry.byeAssignments) ? cloneData(entry.byeAssignments) : [],
        }];
    waves.forEach(wave => {
      const startLabel = clock == null ? '' : formatTimeLabel(clock);
      const endLabel = clock == null ? '' : formatTimeLabel(clock + Number(options.duration || 7));
      const preparedMatches = (wave.matches || []).map((match, matchIndex) => {
        totalMatches += 1;
        return {
          ...match,
          field: match.field || matchIndex + 1,
          phase: match.phase || entry.phase || (extras.finals ? 'groups-finals' : 'groups'),
          groupId: match.groupId || entry.groupId || null,
          groupLabel: match.groupLabel || entry.groupLabel || null,
        };
      });
      rotations.push({
        ...wave,
        number: rotationNumber,
        title: wave.title || `Rotation ${rotationNumber}`,
        startLabel,
        endLabel,
        matches: preparedMatches,
      });
      rotationNumber += 1;
      if (clock != null) {
        clock += Number(options.duration || 7);
      }
    });
  });
  return {
    format: extras.finals ? 'groups-finals' : 'groups',
    rotations,
    teams: allTeams.map(name => ({ name })),
    groups,
    finals: extras.finals ? { enabled: true } : null,
    meta: {
      format: extras.finals ? 'groups-finals' : 'groups',
      formatLabel: extras.finals ? TOURNAMENT_MODES['groups-finals'].label : 'Groupes',
      teamCount: allTeams.length,
      matchCount: totalMatches,
      fieldCount,
      rotationCount: rotations.length,
      practiceType: options.practiceType,
      durationMinutes: Number(options.duration || 7),
    },
  };
}

function buildGroupPoolsRaquetteSchedule(teams, options) {
  const poolSize = clampNumber(Number(options.poolSize) || 4, 3, 6, 4);
  const targetGroups = Math.max(1, Math.ceil(teams.length / poolSize));
  const groups = distributeIntoGroups(teams, { targetGroups });
  const enabledRoles = getEnabledRolesFromOptions(options);
  const groupedRounds = groups.map(group => ({
    ...group,
    rounds: createRoundRobinPairs(group.teams, options),
  }));
  const entries = [];
  const maxRounds = Math.max(...groupedRounds.map(group => group.rounds.length));
  for (let roundIndex = 0; roundIndex < maxRounds; roundIndex += 1) {
    const matches = [];
    const byes = [];
    groupedRounds.forEach(group => {
      const round = group.rounds[roundIndex];
      if (!round) {
        group.teams.forEach(team => byes.push(team));
        return;
      }
      round.matches.forEach(match => {
        matches.push({
          ...match,
          phase: 'groups-pools',
          groupId: group.id,
          groupLabel: group.label,
        });
      });
      round.byes.forEach(name => byes.push(name));
    });
    const embeddedReferees = new Set(matches.map(match => match.referee).filter(Boolean));
    entries.push({
      phase: 'groups-pools',
      title: `Rotation ${entries.length + 1}`,
      matches,
      byes,
      byeAssignments: assignRolesForByes(byes.filter(name => !embeddedReferees.has(name)), enabledRoles),
    });
  }
  const fieldCount = clampNumber(Number(options.fields) || 1, 1, 20, 1);
  const rotations = [];
  let rotationNumber = 1;
  let totalMatches = 0;
  let clock = parseTime(options.startTime);
  entries.forEach(entry => {
    const waves = splitRotationIntoWaves({
      number: rotationNumber,
      title: entry.title || `Rotation ${rotationNumber}`,
      phase: entry.phase,
      groupId: entry.groupId || null,
      groupLabel: entry.groupLabel || null,
      matches: entry.matches.map(match => ({ ...match })),
      byes: [...(entry.byes || [])],
      byeAssignments: Array.isArray(entry.byeAssignments) ? cloneData(entry.byeAssignments) : [],
    }, fieldCount, enabledRoles);
    waves.forEach(wave => {
      const startLabel = clock == null ? '' : formatTimeLabel(clock);
      const endLabel = clock == null ? '' : formatTimeLabel(clock + Number(options.duration || 7));
      const preparedMatches = (wave.matches || []).map((match, matchIndex) => {
        totalMatches += 1;
        return {
          ...match,
          field: match.field || matchIndex + 1,
          phase: match.phase || 'groups-pools',
          groupId: match.groupId || entry.groupId || null,
          groupLabel: match.groupLabel || entry.groupLabel || null,
        };
      });
      rotations.push({
        ...wave,
        number: rotationNumber,
        title: wave.title || `Rotation ${rotationNumber}`,
        startLabel,
        endLabel,
        matches: preparedMatches,
      });
      rotationNumber += 1;
      if (clock != null) {
        clock += Number(options.duration || 7);
      }
    });
  });
  return {
    format: 'groups-pools',
    rotations,
    teams: teams.map(name => ({ name })),
    groups,
    finals: null,
    meta: {
      format: 'groups-pools',
      formatLabel: TOURNAMENT_MODES['groups-pools'].label,
      teamCount: teams.length,
      matchCount: totalMatches,
      fieldCount,
      rotationCount: rotations.length,
      practiceType: options.practiceType,
      durationMinutes: Number(options.duration || 7),
    },
  };
}

function buildLadderRotation(order, rotationNumber, options) {
  const fieldCount = clampNumber(Number(options.fields) || 1, 1, 20, 1);
  const arbitratedFieldSet = new Set((options.ladderArbitratedFields || []).map(Number));
  const sourceSlots = Array.isArray(options.ladderInitialSlots) && options.ladderInitialSlots.length
    ? options.ladderInitialSlots
    : buildAutomaticLadderInitialSlots(order, { fields: fieldCount, ladderArbitratedFields: [...arbitratedFieldSet] }, false);
  const normalizedSlots = sourceSlots
    .map(slot => ({
      field: Number(slot.field),
      home: String(slot.home || '').trim(),
      away: String(slot.away || '').trim(),
      referee: arbitratedFieldSet.has(Number(slot.field)) ? String(slot.referee || '').trim() : '',
      hasReferee: arbitratedFieldSet.has(Number(slot.field)),
    }))
    .filter(slot => Number.isInteger(slot.field) && slot.field >= 1 && slot.field <= fieldCount)
    .sort((left, right) => left.field - right.field);
  const roster = new Set(order);
  const slots = normalizedSlots
    .filter(slot => {
      if (!slot.home || !slot.away) return false;
      if (slot.hasReferee && !slot.referee) return false;
      return roster.has(slot.home) && roster.has(slot.away) && (!slot.referee || roster.has(slot.referee));
    })
    .map(slot => ({
      field: slot.field,
      home: slot.home,
      away: slot.away,
      referee: slot.hasReferee ? slot.referee : null,
      hasReferee: slot.hasReferee,
    }));

  if (!validateUniqueLadderSlotParticipants(slots, 'initial ladder placement')) {
    throw new Error('Placement initial Ladder invalide : doublon détecté.');
  }

  if (!slots.length) {
    return {
      number: rotationNumber,
      title: `Rotation ${rotationNumber}`,
      phase: 'ladder',
      matches: [],
      byes: [...order],
      byeAssignments: assignRolesForByes(order, getEnabledRolesFromOptions(options)),
      orderSnapshot: [...order],
      ladderSlots: [],
      arbitratedFields: 0,
      freeFields: 0,
      warningMessage: `⚠️ Pas assez de joueurs pour former un seul match.`,
    };
  }

  const usedPlayers = new Set(slots.flatMap(slot => [slot.home, slot.away, slot.referee].filter(Boolean)));
  const byes = order.filter(name => !usedPlayers.has(name));
  const arbitratedFields = slots.filter(slot => slot.hasReferee).length;
  const freeFields = slots.length - arbitratedFields;
  const warningMessage = byes.length > 0
    ? `⚠️ ${byes.length} élève(s) en attente cette rotation. Donnez-leur un rôle actif.`
    : null;

  const matches = slots.map(slot => ({
    id: buildMatchKey(rotationNumber, slot.home, slot.away),
    home: slot.home,
    away: slot.away,
    field: slot.field,
    phase: 'ladder',
    hasReferee: slot.hasReferee,
    ...(slot.referee ? { ladderReferee: slot.referee } : {}),
  }));

  const byeAssignments = assignLadderByeAssignments(byes, options);

  return {
    number: rotationNumber,
    title: `Rotation ${rotationNumber}`,
    phase: 'ladder',
    matches,
    byes,
    byeAssignments,
    orderSnapshot: [
      ...slots.flatMap(slot => [slot.home, slot.away, slot.referee].filter(Boolean)),
      ...byes,
    ],
    ladderSlots: slots,
    arbitratedFields,
    freeFields,
    warningMessage,
  };
}

function buildLadderSchedule(teams, options) {
  const rotationTarget = getEstimatedRotationCount(teams.length, options.fields, { teamBased: false });
  const firstRotation = buildLadderRotation([...teams], 1, options);
  return {
    format: 'ladder',
    rotations: [firstRotation],
    teams: teams.map(name => ({ name })),
    ladder: {
      rotationTarget,
      latestOrder: [...(firstRotation.orderSnapshot || teams)],
      currentSlots: firstRotation.ladderSlots || [],
      arbitratedFields: cloneData(options.ladderArbitratedFields || []),
    },
    meta: {
      format: 'ladder',
      formatLabel: TOURNAMENT_MODES.ladder.label,
      teamCount: teams.length,
      matchCount: firstRotation.matches.length,
      fieldCount: clampNumber(Number(options.fields) || 1, 1, 20, 1),
      rotationCount: 1,
      practiceType: options.practiceType,
      durationMinutes: Number(options.duration || 7),
    },
  };
}

function validateLadderMovement(previousRotation, nextRotation) {
  const previousSlots = Array.isArray(previousRotation?.ladderSlots) ? previousRotation.ladderSlots : [];
  const nextSlots = Array.isArray(nextRotation?.ladderSlots)
    ? nextRotation.ladderSlots
    : Array.isArray(nextRotation)
      ? nextRotation
      : [];
  const previousFieldMap = new Map();
  previousSlots.forEach(slot => {
    [slot.home, slot.away, slot.referee].filter(Boolean).forEach(name => previousFieldMap.set(name, slot.field));
  });
  const nextFieldMap = new Map();
  nextSlots.forEach(slot => {
    [slot.home, slot.away, slot.referee].filter(Boolean).forEach(name => nextFieldMap.set(name, slot.field));
  });
  const violations = [];
  previousFieldMap.forEach((field, name) => {
    if (!nextFieldMap.has(name)) return;
    const nextField = nextFieldMap.get(name);
    if (Math.abs(nextField - field) > 1) {
      violations.push({ name, from: field, to: nextField });
    }
  });
  return {
    valid: violations.length === 0,
    violations,
  };
}

function validateUniqueLadderSlotParticipants(slots, contextLabel = 'ladder') {
  const seen = new Set();
  const duplicates = [];
  (slots || []).forEach(slot => {
    [slot.home, slot.away, slot.referee].filter(Boolean).forEach(name => {
      if (seen.has(name)) duplicates.push(name);
      seen.add(name);
    });
  });
  if (duplicates.length) {
    console.warn(`[buildNextFreeLadderSlots] ${contextLabel} : doublon(s) détecté(s) ${[...new Set(duplicates)].join(', ')}`);
    return false;
  }
  return true;
}

function buildNextFreeLadderSlots(freeResults) {
  const ordered = [...(freeResults || [])].sort((left, right) => left.field - right.field);
  const nextSlots = ordered.map(result => ({
    field: result.field,
    home: result.home,
    away: result.away,
    referee: null,
    hasReferee: false,
  }));
  let segmentStart = null;

  const flushSegment = segmentEnd => {
    if (segmentStart == null) return;
    const length = segmentEnd - segmentStart + 1;
    if (length < 2) {
      segmentStart = null;
      return;
    }
    for (let index = segmentStart; index <= segmentEnd; index += 1) {
      const localIndex = index - segmentStart;
      const current = ordered[index];
      if (localIndex === 0) {
        nextSlots[index] = {
          field: current.field,
          home: ordered[index].winner,
          away: ordered[index + 1].winner,
          referee: null,
          hasReferee: false,
        };
      } else if (localIndex === length - 1) {
        nextSlots[index] = {
          field: current.field,
          home: ordered[index - 1].loser,
          away: ordered[index].loser,
          referee: null,
          hasReferee: false,
        };
      } else {
        nextSlots[index] = {
          field: current.field,
          home: ordered[index - 1].loser,
          away: ordered[index + 1].winner,
          referee: null,
          hasReferee: false,
        };
      }
    }
    segmentStart = null;
  };

  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    const decisive = !current.draw && Boolean(current.winner) && Boolean(current.loser);
    if (!decisive) {
      flushSegment(index - 1);
      nextSlots[index] = {
        field: current.field,
        home: current.home,
        away: current.away,
        referee: null,
        hasReferee: false,
      };
      continue;
    }
    if (segmentStart == null) segmentStart = index;
  }
  flushSegment(ordered.length - 1);

  if (!validateUniqueLadderSlotParticipants(nextSlots, 'free ladder chain')) {
    return null;
  }
  return nextSlots;
}

function buildNextFixedArbitratedLadderSlots(results) {
  const ordered = [...(results || [])].sort((left, right) => left.field - right.field);
  const nextSlots = ordered.map((current, index) => {
    const above = index > 0 ? ordered[index - 1] : null;
    const below = index < ordered.length - 1 ? ordered[index + 1] : null;
    if (current.draw) {
      return {
        field: current.field,
        home: current.home,
        away: current.away,
        referee: current.hasReferee ? current.referee : null,
        hasReferee: current.hasReferee,
      };
    }
    const incomingAboveLoser = above && !above.draw ? above.loser : null;
    const incomingBelowWinner = below && !below.draw ? below.winner : null;
    if (current.hasReferee) {
      return {
        field: current.field,
        home: current.referee || current.home,
        away: incomingAboveLoser || current.winner || current.away,
        referee: incomingBelowWinner || current.loser || current.referee || null,
        hasReferee: true,
      };
    }
    return {
      field: current.field,
      home: incomingAboveLoser || current.winner || current.home,
      away: incomingBelowWinner || current.loser || current.away,
      referee: null,
      hasReferee: false,
    };
  });
  if (!validateUniqueLadderSlotParticipants(nextSlots, 'fixed arbitrated ladder chain')) {
    return null;
  }
  return nextSlots;
}

function buildChallengeBoard(teams, options) {
  const orderedTeams = teams.map((name, index) => ({ name, rank: index + 1 }));
  return {
    format: 'challenge',
    rotations: [],
    teams: orderedTeams,
    challengeLog: [],
    meta: {
      format: 'challenge',
      formatLabel: TOURNAMENT_MODES.challenge.label,
      teamCount: teams.length,
      matchCount: 0,
      fieldCount: clampNumber(Number(options.fields) || 1, 1, 20, 1),
      rotationCount: 0,
      practiceType: options.practiceType,
      durationMinutes: Number(options.duration || 7),
    },
  };
}

function buildSwissRotation(roundNumber, matches, playerMap, options = {}) {
  const byeNames = matches.filter(m => m.bye).map(m => playerMap.get(m.p1Id)?.name).filter(Boolean);
  const enabledRoles = getEnabledRolesFromOptions(options);
  return {
    number: roundNumber,
    title: `Ronde ${roundNumber}`,
    phase: 'swiss',
    byeAssignments: assignRolesForByes(byeNames, enabledRoles),
    matches: matches.filter(match => !match.bye).map(match => ({
      id: match.id,
      home: playerMap.get(match.p1Id)?.name || '',
      away: playerMap.get(match.p2Id)?.name || '',
      field: match.field,
      phase: 'swiss',
      swissP1Id: match.p1Id,
      swissP2Id: match.p2Id,
      swissNote: `${formatDisplayName(playerMap.get(match.p1Id)?.name || '')} et ${formatDisplayName(playerMap.get(match.p2Id)?.name || '')} ont tous les deux ${playerMap.get(match.p1Id)?.points || 0} pt${(playerMap.get(match.p1Id)?.points || 0) > 1 ? 's' : ''}`,
    })),
    byes: matches.filter(match => match.bye).map(match => playerMap.get(match.p1Id)?.name).filter(Boolean),
  };
}

function generateSwissPairings(players, previousMatches) {
  const previousOpponentMap = new Map();
  (previousMatches || []).forEach(match => {
    if (match?.bye) return;
    if (!previousOpponentMap.has(match.p1Id)) previousOpponentMap.set(match.p1Id, new Set());
    if (!previousOpponentMap.has(match.p2Id)) previousOpponentMap.set(match.p2Id, new Set());
    previousOpponentMap.get(match.p1Id).add(match.p2Id);
    previousOpponentMap.get(match.p2Id).add(match.p1Id);
  });
  const activePlayers = [...players].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    return a.seed - b.seed;
  });
  const matches = [];
  let pool = [...activePlayers];
  if (pool.length % 2 === 1) {
    const byeCandidates = [...pool].sort((a, b) => {
      if (a.bye !== b.bye) return a.bye - b.bye;
      if (a.points !== b.points) return a.points - b.points;
      if (a.wins !== b.wins) return a.wins - b.wins;
      return b.seed - a.seed;
    });
    const byePlayer = byeCandidates[0];
    pool = pool.filter(player => player.id !== byePlayer.id);
    matches.push({
      id: `swiss-bye-${(previousMatches?.length || 0) + 1}-${byePlayer.id}`,
      p1Id: byePlayer.id,
      p2Id: null,
      bye: true,
      field: null,
    });
  }
  let field = 1;
  while (pool.length) {
    const p1 = pool.shift();
    if (!p1) break;
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    pool.forEach((candidate, index) => {
      const alreadyPlayed = previousOpponentMap.get(p1.id)?.has(candidate.id) || false;
      const scoreGap = Math.abs((candidate.points || 0) - (p1.points || 0));
      const pairingScore = alreadyPlayed ? scoreGap + 100 : scoreGap;
      if (pairingScore < bestScore) {
        bestScore = pairingScore;
        bestIndex = index;
      }
    });
    const p2 = bestIndex === -1 ? pool.shift() : pool.splice(bestIndex, 1)[0];
    if (!p2) break;
    matches.push({
      id: `swiss-${(previousMatches?.length || 0) + 1}-${field}`,
      p1Id: p1.id,
      p2Id: p2.id,
      bye: false,
      field,
    });
    field += 1;
  }
  return matches;
}

function initializeSwissMode(teams, options) {
  const players = teams.map((name, index) => ({
    id: index + 1,
    seed: index,
    name,
    points: 0,
    matches: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    bye: 0,
    opponents: [],
  }));
  const currentMatches = generateSwissPairings(players, []);
  const playerMap = new Map(players.map(player => [player.id, player]));
  const maxRounds = clampNumber(Math.ceil(Math.log2(Math.max(players.length, 2))) + 1, 3, 8, 4);
  const rotations = splitRotationIntoWaves(buildSwissRotation(1, currentMatches, playerMap, options), options.fields, getEnabledRolesFromOptions(options));
  validateRotationCapacity(rotations, options.fields, 'swiss');
  rotations.forEach(rotation => validateRotationRoles(rotation, 'swiss'));
  return {
    format: 'swiss',
    rotations,
    teams: teams.map(name => ({ name })),
    swiss: {
      round: 1,
      maxRounds,
      players,
      currentMatches,
      history: [],
    },
    meta: {
      format: 'swiss',
      formatLabel: TOURNAMENT_MODES.swiss.label,
      teamCount: teams.length,
      matchCount: currentMatches.filter(match => !match.bye).length,
      fieldCount: clampNumber(Number(options.fields) || 1, 1, 20, 1),
      rotationCount: rotations.length,
      practiceType: options.practiceType,
      durationMinutes: Number(options.duration || 7),
    },
  };
}

function buildIntraPoolRotations(poolPlayers, teamSize, targetRotations) {
  const rotations = [];
  const teamCount = Math.floor(poolPlayers.length / teamSize);
  const activeTeamCount = teamCount - (teamCount % 2);
  const activePlayerCount = activeTeamCount * teamSize;
  if (!activeTeamCount) {
    return Array.from({ length: targetRotations }, () => ({ matches: [], byes: [...poolPlayers] }));
  }
  for (let rotationIndex = 0; rotationIndex < targetRotations; rotationIndex += 1) {
    const shiftedPlayers = poolPlayers.length > activePlayerCount
      ? [
          ...poolPlayers.slice(rotationIndex % poolPlayers.length),
          ...poolPlayers.slice(0, rotationIndex % poolPlayers.length),
        ]
      : [...poolPlayers];
    const activePlayers = shiftedPlayers.slice(0, activePlayerCount);
    const byes = shiftedPlayers.slice(activePlayerCount);
    const matches = [];
    for (let index = 0; index < activePlayers.length; index += teamSize * 2) {
      const homePlayers = activePlayers.slice(index, index + teamSize);
      const awayPlayers = activePlayers.slice(index + teamSize, index + teamSize * 2);
      if (homePlayers.length === teamSize && awayPlayers.length === teamSize) {
        matches.push({ homePlayers, awayPlayers });
      }
    }
    rotations.push({ matches, byes });
  }
  return rotations;
}

function validateRotatingSchedule(schedule) {
  if (!schedule || schedule.format !== 'rotating-teams') return;
  const players = schedule.rotatingTeams?.players || [];
  const poolMap = new Map();
  players.forEach(player => poolMap.set(player.name, player.poolId));
  schedule.rotations.forEach((rotation, rotationIndex) => {
    const seen = new Set();
    const addPlayer = (name, source) => {
      if (!name) {
        console.warn(`[validateRotating] Rotation ${rotationIndex + 1} — nom vide dans ${source}`);
        return;
      }
      if (seen.has(name)) {
        console.warn(`[validateRotating] Rotation ${rotationIndex + 1} — doublon : "${name}"`);
      }
      seen.add(name);
    };
    rotation.matches.forEach((match, matchIndex) => {
      const allPlayers = [...(match.homePlayers || []), ...(match.awayPlayers || [])];
      const pools = new Set(allPlayers.map(name => poolMap.get(name)).filter(Boolean));
      if (pools.size > 1) {
        console.warn(`[validateRotating] Rotation ${rotationIndex + 1} match ${matchIndex + 1} — MÉLANGE DE POULES : ${[...pools].join(', ')}`);
      }
      (match.homePlayers || []).forEach(name => addPlayer(name, 'homePlayers'));
      (match.awayPlayers || []).forEach(name => addPlayer(name, 'awayPlayers'));
    });
    (rotation.byes || []).forEach(name => addPlayer(name, 'byes'));
  });
}

function generateRotatingTeamsSchedule(teams, options) {
  const names = [...teams];
  const teamSize = clampNumber(Number(options.teamSize) || 3, 2, 8, 3);
  const minPlayersPerPool = teamSize * 2;
  const maxPoolCount = options.organization === 'full-random'
    ? 1
    : Math.max(1, Math.min(Number(options.fields) || 1, Math.floor(names.length / minPlayersPerPool) || 1));
  let poolCount = Math.max(1, maxPoolCount);
  if (options.organization !== 'full-random') {
    const scoredPoolCounts = [];
    for (let candidate = 1; candidate <= maxPoolCount; candidate += 1) {
      const basePoolSize = Math.floor(names.length / candidate);
      const remainder = names.length % candidate;
      const sizes = Array.from({ length: candidate }, (_, index) => basePoolSize + (index < remainder ? 1 : 0));
      const activeRatios = sizes.map(size => {
        const teamCount = Math.floor(size / teamSize);
        const activeTeamCount = teamCount - (teamCount % 2);
        const activePlayers = activeTeamCount * teamSize;
        return size ? activePlayers / size : 0;
      });
      scoredPoolCounts.push({
        candidate,
        spread: Math.max(...activeRatios) - Math.min(...activeRatios),
        inactive: sizes.reduce((sum, size) => {
          const teamCount = Math.floor(size / teamSize);
          const activeTeamCount = teamCount - (teamCount % 2);
          return sum + (size - activeTeamCount * teamSize);
        }, 0),
      });
    }
    scoredPoolCounts.sort((left, right) => left.spread - right.spread || left.inactive - right.inactive || left.candidate - right.candidate);
    poolCount = scoredPoolCounts[0]?.candidate || poolCount;
  }
  const pools = [];
  const basePoolSize = Math.floor(names.length / poolCount);
  const remainder = names.length % poolCount;
  let cursor = 0;
  for (let index = 0; index < poolCount; index += 1) {
    const size = basePoolSize + (index < remainder ? 1 : 0);
    pools.push({
      id: `P${index + 1}`,
      label: `Poule ${String.fromCharCode(65 + index)}`,
      players: names.slice(cursor, cursor + size),
    });
    cursor += size;
  }
  const targetRotations = getEstimatedRotationCount(names.length, options.fields, { teamBased: false });
  const rotationsByPool = pools.map(pool => buildIntraPoolRotations(pool.players, teamSize, targetRotations));
  const enabledRoles = getEnabledRolesFromOptions(options);
  const rotations = [];
  const fieldCount = clampNumber(Number(options.fields) || 1, 1, 20, 1);
  for (let rotationIndex = 0; rotationIndex < targetRotations; rotationIndex += 1) {
    const matches = [];
    const byes = [];
    let field = 1;
    pools.forEach((pool, poolIndex) => {
      const currentRotation = rotationsByPool[poolIndex][rotationIndex];
      currentRotation.matches.forEach(match => {
        matches.push({
          id: `rot-${rotationIndex + 1}-${field}`,
          field,
          poolId: pool.id,
          groupLabel: pool.label,
          homePlayers: [...match.homePlayers],
          awayPlayers: [...match.awayPlayers],
          phase: 'rotating-teams',
        });
        field += 1;
      });
      byes.push(...currentRotation.byes);
    });
    const waves = splitRotationIntoWaves({
      number: rotationIndex + 1,
      title: `Rotation ${rotationIndex + 1}`,
      phase: 'rotating-teams',
      matches,
      byes,
      byeAssignments: assignRolesForByes(byes, enabledRoles),
    }, fieldCount, enabledRoles);
    waves.forEach(wave => {
      rotations.push({
        ...wave,
        number: rotations.length + 1,
        title: `Rotation ${rotations.length + 1}`,
      });
    });
  }
  const players = [];
  pools.forEach(pool => {
    pool.players.forEach((name, index) => {
      players.push({
        id: players.length + 1,
        name,
        poolId: pool.id,
        seed: index,
      });
    });
  });
  const schedule = {
    format: 'rotating-teams',
    rotations,
    teams: names.map(name => ({ name })),
    rotatingTeams: {
      organization: options.organization || 'pools',
      teamSize,
      players,
      pools: pools.map(pool => ({ id: pool.id, label: pool.label, playerIds: pool.players.map(name => players.find(player => player.name === name)?.id).filter(Boolean) })),
    },
    meta: {
      format: 'rotating-teams',
      formatLabel: TOURNAMENT_MODES['rotating-teams'].label,
      teamCount: names.length,
      matchCount: rotations.reduce((sum, rotation) => sum + rotation.matches.length, 0),
      fieldCount: clampNumber(Number(options.fields) || 1, 1, 20, 1),
      rotationCount: rotations.length,
      practiceType: options.practiceType,
      durationMinutes: Number(options.duration || 7),
    },
  };
  validateRotationCapacity(schedule.rotations, fieldCount, 'rotating-teams');
  schedule.rotations.forEach(rotation => validateRotationRoles(rotation, 'rotating-teams'));
  validateRotatingSchedule(schedule);
  return schedule;
}

function generateSchedule(teams, options) {
  const format = getTournamentType(options);
  let schedule;
  if (format === 'round-robin') {
    schedule = buildSinglePoolSchedule(teams, options);
  } else if (format === 'groups-finals') {
    const groups = distributeIntoGroups(teams, { finals: true, targetGroups: 2 });
    schedule = buildGroupedSchedule(groups, teams, options, { finals: true });
  } else if (format === 'groups-pools') {
    schedule = buildGroupPoolsRaquetteSchedule(teams, options);
  } else if (format === 'rotating-teams') {
    schedule = generateRotatingTeamsSchedule(teams, options);
  } else if (format === 'ladder') {
    schedule = buildLadderSchedule(teams, options);
  } else if (format === 'swiss') {
    schedule = initializeSwissMode(teams, options);
  } else if (format === 'challenge') {
    schedule = buildChallengeBoard(teams, options);
  } else {
    schedule = buildSinglePoolSchedule(teams, options);
  }
  ensureStableMatchIds(schedule);
  validateUniqueMatchIds(schedule);
  validateTournamentSchedule(schedule, options);
  return schedule;
}

/* === Sauvegarde et restauration === */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('[EPS Tournoi] Données corrompues, réinitialisation.', error);
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    return null;
  }
}

function sanitizeState(raw) {
  const base = createDefaultState();
  const source = raw && typeof raw === 'object' ? raw : base;
  const next = {
    ...base,
    ...source,
    draft: {
      ...base.draft,
      ...(source.draft || {}),
    },
    timer: {
      ...base.timer,
      ...(source.timer || {}),
    },
  };
  next.view = ['home', 'new', 'sessions', 'live', 'summary', 'classrooms', 'classroom-detail'].includes(next.view) ? next.view : 'home';
  next.draft.sport = next.draft.sport === 'raquette' ? 'raquette' : 'sport-co';
  const allowedFormats = FORMAT_DEFINITIONS[next.draft.sport].map(item => item.id);
  next.draft.format = allowedFormats.includes(next.draft.format) ? next.draft.format : FORMAT_DEFINITIONS[next.draft.sport][0].id;
  next.draft.participantCount = clampSetupCount(next.draft.participantCount, 24);
  next.draft.fields = clampNumber(Number(next.draft.fields) || 2, 1, 20, 2);
  next.draft.challengeRange = clampNumber(Number(next.draft.challengeRange) || 5, 1, 10, 5);
  next.draft.poolSize = clampNumber(Number(next.draft.poolSize) || 4, 3, 6, 4);
  next.draft.duration = clampNumber(Number(next.draft.duration) || 7, 1, 60, 7);
  next.draft.challengePlacementMode = ['auto', 'alpha', 'random', 'manual'].includes(next.draft.challengePlacementMode)
    ? next.draft.challengePlacementMode
    : 'auto';
  next.draft.ladderPlacementMode = ['auto', 'alpha', 'random', 'manual'].includes(next.draft.ladderPlacementMode)
    ? next.draft.ladderPlacementMode
    : 'auto';
  next.draft.challengeInitialRanking = getDraftChallengeInitialRankingForSource(next.draft).map(entry => ({
    rank: entry.rank,
    name: entry.name,
  }));
  next.draft.ladderArbitratedFields = normalizeLadderArbitratedFieldsForSource(next.draft);
  next.draft.ladderInitialSlots = getDraftLadderInitialSlotsForSource(next.draft).map(slot => ({
    field: slot.field,
    home: slot.home,
    away: slot.away,
    referee: slot.referee,
  }));
  next.draft.newStep = clampDraftStep(next.draft.newStep);
  next.draft.startTime = next.draft.startTime || '10:00';
  next.draft.endTime = next.draft.endTime || '11:00';
  next.draft.teamNames = Array.isArray(next.draft.teamNames) ? next.draft.teamNames.map(value => String(value || '')) : [];
  next.draft.studentNamesText = String(next.draft.studentNamesText || '');
  next.draft.sessionName = String(next.draft.sessionName || '');
  next.currentSession = source.currentSession && typeof source.currentSession === 'object' ? source.currentSession : null;
  next.lastStatsSessionId = source.lastStatsSessionId || null;
  return next;
}

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...state,
      timer: {
        totalSeconds: state.timer.totalSeconds,
        remainingSeconds: state.timer.remainingSeconds,
        running: false,
      },
    }));
  } catch (error) {
    console.warn('Impossible de sauvegarder l’état principal', error);
  }
}

function loadStoredSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[EPS Tournoi] Données corrompues, réinitialisation.', error);
    try { localStorage.removeItem(SESSIONS_KEY); } catch (_) {}
    return [];
  }
}

function saveStoredSessions(entries) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(entries));
  } catch (error) {
    console.error('[EPS Tournoi] Impossible de sauvegarder les séances (quota dépassé ?)', error);
    window.alert('Espace de stockage plein. Exportez vos séances depuis la liste des séances pour libérer de la place.');
  }
}

function loadClassrooms() {
  try {
    const raw = localStorage.getItem(CLASSROOMS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[EPS Tournoi] Données corrompues, réinitialisation.', error);
    try { localStorage.removeItem(CLASSROOMS_KEY); } catch (_) {}
    return [];
  }
}

function saveClassrooms(list) {
  localStorage.setItem(CLASSROOMS_KEY, JSON.stringify(Array.isArray(list) ? list : []));
}

function getClassroomById(id) {
  return loadClassrooms().find(classroom => classroom.id === id) || null;
}

function upsertClassroom(classroom) {
  if (!classroom?.id) return;
  const list = loadClassrooms().filter(entry => entry.id !== classroom.id);
  list.push(classroom);
  list.sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'fr'));
  saveClassrooms(list);
}

function deleteClassroom(id) {
  saveClassrooms(loadClassrooms().filter(classroom => classroom.id !== id));
}

function buildAppSaveSnapshot(session = state.currentSession) {
  if (!session) return null;
  return {
    id: session.id,
    savedAt: new Date().toISOString(),
    name: session.name,
    sport: session.sport,
    format: session.format,
    teams: [...session.teams],
    schedule: cloneData(session.schedule),
    scores: cloneData(session.scores),
    currentRotation: session.currentRotation,
    options: { ...session.options },
    timer: {
      totalSeconds: Number(state.timer?.totalSeconds) || ((session.options?.duration || 7) * 60),
      remainingSeconds: Number(state.timer?.remainingSeconds) || ((session.options?.duration || 7) * 60),
      running: Boolean(state.timer?.running),
    },
    completed: Boolean(session.completed),
    createdAt: session.createdAt,
    classroomId: session.classroomId || null,
    classroomName: session.classroomName || null,
    challengeOrder: session.challengeOrder ? [...session.challengeOrder] : undefined,
    challengeLog: session.challengeLog ? cloneData(session.challengeLog) : undefined,
  };
}

function upsertStoredSession(snapshot) {
  if (!snapshot?.id) return;
  const sessions = loadStoredSessions().filter(entry => entry.id !== snapshot.id);
  sessions.push(snapshot);
  sessions.sort((left, right) => new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime());
  saveStoredSessions(sessions);
}

function saveSessionLocally(session = state.currentSession) {
  const snapshot = buildAppSaveSnapshot(session);
  if (!snapshot) return null;
  upsertStoredSession(snapshot);
  state.lastStatsSessionId = snapshot.id;
  persistState();
  return snapshot;
}

function deleteStoredSession(sessionId) {
  saveStoredSessions(loadStoredSessions().filter(entry => entry.id !== sessionId));
  if (state.lastStatsSessionId === sessionId) {
    state.lastStatsSessionId = loadStoredSessions()[0]?.id || null;
    persistState();
  }
}

/* === Résolution des matches et statistiques === */

function getSessionById(sessionId) {
  return loadStoredSessions().find(session => session.id === sessionId) || null;
}

function getCurrentRotation(session = state.currentSession, index = session?.currentRotation ?? 0) {
  return session?.schedule?.rotations?.[index] || null;
}

function getScoreRecord(session, matchId) {
  const record = session?.scores?.[matchId];
  if (!record) return null;
  return typeof record === 'object' ? record : null;
}

function isMatchResultValidated(record, matchId = '') {
  if (!record || typeof record !== 'object') return false;
  const hasScores = Number.isFinite(record.home) && Number.isFinite(record.away);
  const isValidated = record.confirmed === true || record.validated === true;
  if (hasScores && !isValidated) {
    console.warn(`[scoreValidation] Score présent sans validation explicite${matchId ? ` pour ${matchId}` : ''}.`);
    return false;
  }
  return hasScores && isValidated;
}

function isScoreComplete(record) {
  return isMatchResultValidated(record);
}

function createExplicitScoreRecord(home, away) {
  const record = {
    home: Math.max(0, Number(home) || 0),
    away: Math.max(0, Number(away) || 0),
    confirmed: true,
    validated: true,
  };
  if (record.confirmed !== true && record.validated !== true) {
    console.warn('[scoreValidation] Écriture d’un score sans validation explicite.');
  }
  return record;
}

function compareStandingsRows(left, right) {
  if (right.points !== left.points) return right.points - left.points;
  if (right.wins !== left.wins) return right.wins - left.wins;
  if (right.goalDiff !== left.goalDiff) return right.goalDiff - left.goalDiff;
  if (right.pointsFor !== left.pointsFor) return right.pointsFor - left.pointsFor;
  return left.name.localeCompare(right.name, 'fr');
}

function getGroupMatchesForStandings(session, groupId) {
  return session.schedule.rotations.flatMap(rotation => rotation.matches.filter(match => match.groupId === groupId));
}

function resolveSeedDescriptor(seed, session) {
  if (!seed) return '';
  if (seed.type === 'group') {
    const rows = computeTeamStandings(session, { scope: 'group', groupId: seed.groupId });
    return rows[seed.position - 1]?.name || '';
  }
  const sourceMatch = findMatchById(session, seed.matchId);
  if (!sourceMatch) return '';
  const participants = resolveMatchParticipants(sourceMatch, session);
  const record = getScoreRecord(session, sourceMatch.id);
  if (!isScoreComplete(record)) return '';
  if (record.home === record.away) return '';
  const winner = record.home > record.away ? participants.home : participants.away;
  const loser = record.home > record.away ? participants.away : participants.home;
  return seed.type === 'matchWinner' ? winner : loser;
}

function resolveMatchParticipants(match, session) {
  if (match.homePlayers && match.awayPlayers) {
    return {
      home: match.homePlayers.join(' · '),
      away: match.awayPlayers.join(' · '),
      homePlayers: [...match.homePlayers],
      awayPlayers: [...match.awayPlayers],
      unresolved: false,
    };
  }
  if (match.seedHome || match.seedAway) {
    const homeResolved = resolveSeedDescriptor(match.seedHome, session);
    const awayResolved = resolveSeedDescriptor(match.seedAway, session);
    return {
      home: homeResolved || match.placeholderHome || 'À déterminer',
      away: awayResolved || match.placeholderAway || 'À déterminer',
      homePlayers: [],
      awayPlayers: [],
      unresolved: !homeResolved || !awayResolved,
    };
  }
  return {
    home: match.home,
    away: match.away,
    homePlayers: [],
    awayPlayers: [],
    unresolved: false,
  };
}

function findMatchById(session, matchId) {
  for (const rotation of session.schedule.rotations) {
    const found = rotation.matches.find(match => match.id === matchId);
    if (found) return found;
  }
  return null;
}

function createStatsRow(name) {
  return {
    name,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    goalDiff: 0,
    badges: [],
  };
}

function computeTeamStandings(session, options = {}) {
  const sourceNames = options.scope === 'group'
    ? (session.schedule.groups.find(group => group.id === options.groupId)?.teams || [])
    : [...session.teams];
  const rows = new Map(sourceNames.map(name => [name, createStatsRow(name)]));
  session.schedule.rotations.forEach(rotation => {
    rotation.matches.forEach(match => {
      if (options.scope === 'group' && match.groupId !== options.groupId) return;
      const participants = resolveMatchParticipants(match, session);
      if (participants.unresolved) return;
      const record = getScoreRecord(session, match.id);
      if (!isScoreComplete(record)) return;
      const home = rows.get(participants.home) || createStatsRow(participants.home);
      const away = rows.get(participants.away) || createStatsRow(participants.away);
      rows.set(participants.home, home);
      rows.set(participants.away, away);
      home.played += 1;
      away.played += 1;
      home.pointsFor += record.home;
      home.pointsAgainst += record.away;
      away.pointsFor += record.away;
      away.pointsAgainst += record.home;
      if (record.home > record.away) {
        home.wins += 1;
        away.losses += 1;
        home.points += 3;
      } else if (record.away > record.home) {
        away.wins += 1;
        home.losses += 1;
        away.points += 3;
      } else {
        home.draws += 1;
        away.draws += 1;
        home.points += 1;
        away.points += 1;
      }
    });
  });
  const ranking = [...rows.values()].map(row => ({
    ...row,
    goalDiff: row.pointsFor - row.pointsAgainst,
  }));
  ranking.sort((left, right) => {
    return compareStandingsRows(left, right);
  });
  if (ranking.length) {
    const bestAttack = Math.max(...ranking.map(row => row.pointsFor));
    const bestDefense = Math.min(...ranking.map(row => row.pointsAgainst));
    ranking.forEach(row => {
      if (bestAttack > 0 && row.pointsFor === bestAttack) row.badges.push('Meilleure attaque');
      if (row.played > 0 && row.pointsAgainst === bestDefense) row.badges.push('Meilleure défense');
    });
  }
  return ranking;
}

function computeRotatingPlayerStats(session) {
  const players = session.schedule.rotatingTeams?.players?.map(player => player.name) || [...session.teams];
  const rows = new Map(players.map(name => [name, createStatsRow(name)]));
  session.schedule.rotations.forEach(rotation => {
    rotation.matches.forEach(match => {
      const record = getScoreRecord(session, match.id);
      if (!isScoreComplete(record)) return;
      const homePlayers = match.homePlayers || [];
      const awayPlayers = match.awayPlayers || [];
      homePlayers.forEach(name => {
        const row = rows.get(name);
        if (!row) return;
        row.played += 1;
        row.pointsFor += record.home;
        row.pointsAgainst += record.away;
        if (record.home > record.away) {
          row.wins += 1;
          row.points += 3;
        } else if (record.home < record.away) {
          row.losses += 1;
        } else {
          row.draws += 1;
          row.points += 1;
        }
      });
      awayPlayers.forEach(name => {
        const row = rows.get(name);
        if (!row) return;
        row.played += 1;
        row.pointsFor += record.away;
        row.pointsAgainst += record.home;
        if (record.away > record.home) {
          row.wins += 1;
          row.points += 3;
        } else if (record.away < record.home) {
          row.losses += 1;
        } else {
          row.draws += 1;
          row.points += 1;
        }
      });
    });
  });
  const ranking = [...rows.values()].map(row => ({
    ...row,
    goalDiff: row.pointsFor - row.pointsAgainst,
    ratio: row.played ? row.wins / row.played : 0,
  }));
  ranking.sort((left, right) => {
    return compareStandingsRows(left, right);
  });
  if (ranking[0]) {
    ranking[0].badges.push('Meilleur joueur');
  }
  return ranking;
}

function computeIndividualStandings(session) {
  if (session.format === 'rotating-teams') {
    return computeRotatingPlayerStats(session);
  }
  const trackNumericPoints = session.format !== 'ladder';
  const rows = new Map(session.teams.map(name => [name, createStatsRow(name)]));
  session.schedule.rotations.forEach(rotation => {
    rotation.matches.forEach(match => {
      const participants = resolveMatchParticipants(match, session);
      const record = getScoreRecord(session, match.id);
      if (!isScoreComplete(record) || participants.unresolved) return;
      const home = rows.get(participants.home) || createStatsRow(participants.home);
      const away = rows.get(participants.away) || createStatsRow(participants.away);
      rows.set(participants.home, home);
      rows.set(participants.away, away);
      home.played += 1;
      away.played += 1;
      if (trackNumericPoints) {
        home.pointsFor += record.home;
        home.pointsAgainst += record.away;
        away.pointsFor += record.away;
        away.pointsAgainst += record.home;
      }
      if (record.home > record.away) {
        home.wins += 1;
        home.points += 3;
        away.losses += 1;
      } else if (record.away > record.home) {
        away.wins += 1;
        away.points += 3;
        home.losses += 1;
      } else {
        home.draws += 1;
        away.draws += 1;
        home.points += 1;
        away.points += 1;
      }
    });
  });
  const ranking = [...rows.values()].map(row => ({
    ...row,
    goalDiff: row.pointsFor - row.pointsAgainst,
    ratio: row.played ? row.wins / row.played : 0,
  }));
  ranking.sort((left, right) => {
    return compareStandingsRows(left, right);
  });
  if (ranking[0]) {
    ranking[0].badges.push('Meilleur joueur');
  }
  return ranking;
}

function computeStandings(session) {
  if (!session) return [];
  if (session.format === 'challenge') {
    const order = session.challengeOrder || session.schedule.teams.map(t => t.name);
    return order.map((name, idx) => {
      const log = session.challengeLog || [];
      const asChallenger = log.filter(l => l.challenger === name);
      const asTarget = log.filter(l => l.target === name);
      const wins = asChallenger.filter(l => !l.isDraw && l.challengerWon).length
                 + asTarget.filter(l => !l.isDraw && !l.challengerWon).length;
      const losses = asChallenger.filter(l => !l.isDraw && !l.challengerWon).length
                   + asTarget.filter(l => !l.isDraw && l.challengerWon).length;
      const draws = log.filter(l => l.isDraw && (l.challenger === name || l.target === name)).length;
      const played = asChallenger.length + asTarget.length;
      const totalFor = asChallenger.reduce((s, l) => s + (l.challengerScore || 0), 0)
                     + asTarget.reduce((s, l) => s + (l.targetScore || 0), 0);
      const totalAgainst = asChallenger.reduce((s, l) => s + (l.targetScore || 0), 0)
                         + asTarget.reduce((s, l) => s + (l.challengerScore || 0), 0);
      return {
        name,
        rank: idx + 1,
        wins,
        losses,
        draws,
        played,
        points: wins * 3 + draws,
        pointsFor: totalFor,
        pointsAgainst: totalAgainst,
        goalDiff: totalFor - totalAgainst,
        ratio: played ? wins / played : 0,
        badges: [],
        challengesMade: asChallenger.length,
        challengesReceived: asTarget.length,
      };
    });
  }
  if (session.sport === 'sport-co' && session.format !== 'rotating-teams') {
    return computeTeamStandings(session);
  }
  return computeIndividualStandings(session);
}

function computeStudentStatsFromSession(session) {
  const standings = computeStandings(session);
  return standings.map((row, index) => ({
    name: row.name,
    played: row.played,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    pointsFor: row.pointsFor,
    pointsAgainst: row.pointsAgainst,
    finalRank: index + 1,
  }));
}

function mergeStudentIntoClassroom(classroom, studentStats, sessionId) {
  if (!classroom || !Array.isArray(studentStats)) return classroom;
  if (!Array.isArray(classroom.students)) classroom.students = [];
  if (!Array.isArray(classroom.sessionIds)) classroom.sessionIds = [];
  if (classroom.sessionIds.includes(sessionId)) return classroom;
  studentStats.forEach(stat => {
    let student = classroom.students.find(entry => entry.name === stat.name);
    if (!student) {
      student = {
        name: stat.name,
        totalPlayed: 0,
        totalWins: 0,
        totalLosses: 0,
        totalDraws: 0,
        totalPointsFor: 0,
        totalPointsAgainst: 0,
        bestRank: null,
        lastRank: null,
        sessionsCount: 0,
      };
      classroom.students.push(student);
    }
    student.totalPlayed += stat.played || 0;
    student.totalWins += stat.wins || 0;
    student.totalLosses += stat.losses || 0;
    student.totalDraws += stat.draws || 0;
    student.totalPointsFor += stat.pointsFor || 0;
    student.totalPointsAgainst += stat.pointsAgainst || 0;
    student.sessionsCount += 1;
    student.bestRank = student.bestRank == null ? stat.finalRank : Math.min(student.bestRank, stat.finalRank);
    student.lastRank = stat.finalRank;
  });
  classroom.sessionIds.push(sessionId);
  return classroom;
}

/* === Navigation entre vues === */

function showView(viewName) {
  state.view = viewName;
  document.querySelectorAll('.view').forEach(section => {
    section.classList.toggle('active', section.dataset.view === viewName);
  });
  if (viewName === 'home') renderHomeView();
  if (viewName === 'new') renderNewTournamentView();
  if (viewName === 'sessions') renderSessionsView();
  if (viewName === 'live') renderLiveView();
  if (viewName === 'summary') renderSummaryView();
  if (viewName === 'classrooms') renderClassroomsView();
  persistState();
}

/* === Vue 2 — formulaire nouveau tournoi === */

function updateDraftSessionNamePlaceholder() {
  if (!dom.sessionNameInput) return;
  const formatTitle = getCurrentFormatDefinition().title;
  const sportTitle = state.draft.sport === 'raquette' ? 'Badminton' : 'Handball';
  dom.sessionNameInput.placeholder = `Classe 5e A - ${sportTitle} · ${formatTitle}`;
}

function renderFormatCards() {
  const cards = FORMAT_DEFINITIONS[state.draft.sport]
    .map(entry => `
      <button class="format-card ${state.draft.format === entry.id ? 'selected' : ''}" type="button" data-format="${entry.id}">
        <div>
          <strong>${entry.icon} ${escapeHtml(entry.title)}</strong>
          <span>${escapeHtml(entry.description)}</span>
        </div>
        ${entry.recommended ? '<span class="format-badge">Recommandé</span>' : ''}
      </button>
    `)
    .join('');
  dom.formatCards.innerHTML = cards;
}

function getNewTournamentStepMeta(step = state.draft.newStep) {
  const currentStep = clampDraftStep(step);
  const definitions = {
    1: {
      title: 'Activité',
      description: 'Choisissez le sport et le format.',
      hint: 'Sélectionnez d’abord le cadre de séance.',
    },
    2: {
      title: 'Paramètres de séance',
      description: 'Renseignez les élèves, les terrains et le créneau.',
      hint: 'Saisissez ici les paramètres qui serviront à l’analyse EPS.',
    },
    3: {
      title: 'Analyse EPS',
      description: 'Analyse de la configuration actuelle et des options possibles.',
      hint: 'Acceptez la recommandation ou revenez ajuster les paramètres.',
    },
    4: {
      title: 'Noms',
      description: 'Ajoutez des noms d’élèves ou d’équipes si vous en avez besoin.',
      hint: 'Cette étape est facultative : vous pouvez aussi la passer.',
    },
    5: {
      title: 'Validation',
      description: 'Vérifiez le résumé final, simulez puis lancez la séance.',
      hint: 'Dernière étape avant le lancement du tournoi.',
    },
  };
  return definitions[currentStep];
}

function buildNewTournamentSummaryRows() {
  const config = getSelectedConfigurationForSource(state.draft);
  const participantSummary = isTeamBasedDraft() && config
    ? `${config.teamCount} équipes · ${config.composition}`
    : `${state.draft.participantCount} élève${state.draft.participantCount > 1 ? 's' : ''}`;
  const start = state.draft.startTime || '--:--';
  const end = state.draft.endTime || '--:--';
  const rows = [
    ['Activité', getActivityLabel(state.draft)],
    ['Format', getFormatLabelFromSource(state.draft)],
    ['Participants', participantSummary],
    ['Terrains', `${state.draft.fields} terrain${state.draft.fields > 1 ? 's' : ''}`],
    ['Créneau', `${start} → ${end} · ${state.draft.duration} min`],
  ];
  if (state.draft.sport === 'raquette' && state.draft.format === 'ladder') {
    const arbitrated = normalizeLadderArbitratedFieldsForSource(state.draft);
    rows.push(['Terrains arbitres', arbitrated.length ? arbitrated.map(field => `T${field}`).join(', ') : 'Aucun']);
  }
  return rows;
}

function renderNewTournamentSummary() {
  if (!dom.newWizardSummary) return;
  const rows = buildNewTournamentSummaryRows();
  dom.newWizardSummary.innerHTML = rows
    .map(([label, value]) => `
      <div class="new-wizard-summary-row">
        <span class="new-wizard-summary-label">${escapeHtml(label)}</span>
        <span class="new-wizard-summary-value">${escapeHtml(value)}</span>
      </div>
    `)
    .join('');
}

function renderNewTournamentInlineSummary() {
  if (!dom.newWizardInlineSummary) return;
  const currentStep = clampDraftStep(state.draft.newStep);
  if (currentStep === 1) {
    dom.newWizardInlineSummary.classList.add('hidden');
    dom.newWizardInlineSummary.textContent = '';
    return;
  }
  const config = getSelectedConfigurationForSource(state.draft);
  const participantSummary = isTeamBasedDraft() && config
    ? `${config.teamCount} équipes`
    : `${state.draft.participantCount} élèves`;
  dom.newWizardInlineSummary.textContent = [
    getActivityLabel(state.draft),
    getFormatLabelFromSource(state.draft),
    participantSummary,
    `${state.draft.fields} terrains`,
  ].join(' • ');
  dom.newWizardInlineSummary.classList.remove('hidden');
}

function getAnalysisOptionNotes(option, report, index) {
  const notes = [];
  if (index === 0) {
    notes.push('Avantage : tous les terrains peuvent rester utilisés avec des équipes de taille raisonnable.');
  } else if (option.usesAllFields) {
    notes.push('Avantage : tous les terrains peuvent être utilisés simultanément.');
  } else {
    notes.push(`Avantage : ${option.restingTeams} équipe${option.restingTeams > 1 ? 's' : ''} au repos, utile pour arbitrer ou souffler.`);
  }
  if (option.teamSize >= 6) {
    notes.push('Limite : équipes assez grandes, donc temps de pratique individuel plus réduit.');
  } else if (option.teamSizes.every(size => size === option.teamSizes[0])) {
    notes.push('Avantage : équipes homogènes et faciles à répartir.');
  } else {
    notes.push('Limite : composition mixte, à expliquer clairement aux élèves avant de démarrer.');
  }
  if (option.teamSize <= 2) {
    notes.push('Limite : peu adapté à la plupart des sports collectifs classiques.');
  } else if (option.restingTeams > 0) {
    notes.push(`Limite : une rotation devra gérer ${option.restingTeams} équipe${option.restingTeams > 1 ? 's' : ''} au repos.`);
  } else if (report.waitingLabel.includes('0 équipe')) {
    notes.push('Limite : sans équipe au repos, prévoir arbitrage croisé si vous activez des rôles.');
  }
  return notes;
}

function renderAnalysisStep() {
  if (!dom.analysisPanel) return;
  const report = buildSimulationReport(state.draft);
  const suggestions = isTeamBasedDraft() ? getSuggestedTeamConfigurations(state.draft) : [];
  const config = getSelectedConfigurationForSource(state.draft);
  const availableMinutes = report.availableMinutes == null ? 'Créneau à vérifier' : `${report.availableMinutes} min`;
  if (!isTeamBasedDraft() || !suggestions.length) {
    dom.analysisPanel.innerHTML = `
      <div class="analysis-card">
        <div class="analysis-metrics">
          <span class="analysis-metric">${state.draft.participantCount} élèves</span>
          <span class="analysis-metric">${state.draft.fields} terrain${state.draft.fields > 1 ? 's' : ''}</span>
          <span class="analysis-metric">${escapeHtml(availableMinutes)}</span>
        </div>
        <div class="analysis-rating">
          <strong>${escapeHtml(report.rating.stars)}</strong>
          <span>${escapeHtml(report.rating.label)}</span>
        </div>
        <ul class="analysis-points">
          ${report.recommendations.slice(0, 4).map(entry => `<li>${escapeHtml(entry)}</li>`).join('')}
        </ul>
      </div>
    `;
    return;
  }
  dom.analysisPanel.innerHTML = `
    <div class="analysis-card analysis-card--hero">
      <div class="analysis-metrics">
        <span class="analysis-metric">${state.draft.participantCount} élèves</span>
        <span class="analysis-metric">${state.draft.fields} terrain${state.draft.fields > 1 ? 's' : ''}</span>
        <span class="analysis-metric">${escapeHtml(availableMinutes)}</span>
      </div>
      <div class="analysis-rating">
        <strong>${escapeHtml(report.rating.stars)}</strong>
        <span>${escapeHtml(report.rating.label)}</span>
      </div>
      <div class="analysis-options">
        ${suggestions.map((option, index) => {
          const isSelected = config?.key === option.key;
          const notes = getAnalysisOptionNotes(option, report, index);
          return `
            <article class="analysis-option-card ${index === 0 ? 'is-recommended' : ''} ${isSelected ? 'is-selected' : ''}">
              <div class="analysis-option-head">
                <div>
                  <span class="analysis-label">${index === 0 ? 'Recommandé' : `Alternative ${index}`}</span>
                  <strong>${escapeHtml(option.label)}</strong>
                </div>
                ${index === 0 ? '<span class="analysis-option-badge">Recommandé</span>' : ''}
              </div>
              <div class="analysis-block">
                <span class="analysis-label">Composition</span>
                <strong>${escapeHtml(option.composition)}</strong>
              </div>
              <div class="analysis-block">
                <span class="analysis-label">Lecture terrain</span>
                <p>${escapeHtml(option.explanation)}</p>
              </div>
              <ul class="analysis-points">
                ${notes.map(entry => `<li>${escapeHtml(entry)}</li>`).join('')}
              </ul>
              <button class="btn ${index === 0 ? 'btn-primary' : 'btn-secondary'} btn-lg" type="button" data-analysis-config-key="${option.key}">Choisir cette option</button>
            </article>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderValidationAnalysis() {
  if (!dom.validationAnalysis) return;
  const report = buildSimulationReport(state.draft);
  const config = getSelectedConfigurationForSource(state.draft);
  const recommendation = config
    ? `${config.teamCount} équipes · ${config.composition}`
    : `${report.unitCount} ${report.unitLabel}`;
  dom.validationAnalysis.innerHTML = `
    <div class="validation-analysis-card">
      <span class="validation-analysis-label">Analyse retenue</span>
      <strong>${escapeHtml(recommendation)}</strong>
      <p>${escapeHtml(report.rating.stars)} ${escapeHtml(report.rating.label)} · ${escapeHtml(report.activeLabel)}</p>
    </div>
  `;
}

function renderNewTournamentStepper() {
  const currentStep = clampDraftStep(state.draft.newStep);
  state.draft.newStep = currentStep;
  if (dom.newStepTitle) dom.newStepTitle.textContent = getNewTournamentStepMeta(currentStep).title;
  if (dom.newStepDescription) dom.newStepDescription.textContent = getNewTournamentStepMeta(currentStep).description;
  if (dom.newStepProgress) dom.newStepProgress.textContent = `Étape ${currentStep} sur ${NEW_TOURNAMENT_STEP_COUNT}`;
  if (dom.newStepNavHint) dom.newStepNavHint.textContent = getNewTournamentStepMeta(currentStep).hint;
  if (dom.newStepPrevBtn) dom.newStepPrevBtn.disabled = currentStep <= 1;
  if (dom.newStepNextBtn) {
    dom.newStepNextBtn.disabled = currentStep >= NEW_TOURNAMENT_STEP_COUNT;
    dom.newStepNextBtn.classList.toggle('hidden', currentStep >= NEW_TOURNAMENT_STEP_COUNT);
  }
  document.querySelectorAll('.new-wizard-step').forEach(section => {
    section.classList.toggle('is-visible', Number(section.dataset.step) === currentStep);
  });
  if (dom.newWizardSteps) {
    Array.from(dom.newWizardSteps.children).forEach((item, index) => {
      const step = index + 1;
      item.classList.toggle('is-active', step === currentStep);
      item.classList.toggle('is-complete', step < currentStep);
    });
  }
  renderNewTournamentInlineSummary();
  renderAnalysisStep();
  renderNewTournamentSummary();
  renderValidationAnalysis();
  renderLadderSetupSection();
  renderChallengeSetupSection();
}

function renderConfigSuggestions() {
  if (!isTeamBasedDraft()) {
    dom.configSuggestions.innerHTML = '';
    return;
  }
  const suggestions = getSuggestedTeamConfigurations(state.draft);
  if (!suggestions.length) {
    dom.configSuggestions.innerHTML = '';
    return;
  }
  const selected = getSelectedConfiguration();
  const selectedExplanation = selected?.explanation || suggestions[0].explanation;
  dom.configSuggestions.innerHTML = `
    <div class="suggestion-note">Recommandation EPS terrain</div>
    <div class="suggestion-chip-row">
      ${suggestions
        .map(entry => `<button class="suggestion-chip ${selected?.key === entry.key ? 'selected' : ''} ${entry.recommended ? 'is-recommended' : ''}" type="button" data-config-key="${entry.key}">${escapeHtml(entry.label)} · ${escapeHtml(entry.summary)}</button>`)
        .join('')}
    </div>
    <div class="suggestion-explanation"><strong>Organisation conseillée :</strong> ${escapeHtml(selectedExplanation)}</div>
  `;
}

function renderTeamNameFields() {
  const config = getSelectedConfiguration();
  const shouldShow = isTeamBasedDraft() && config;
  dom.teamNamesSection.classList.toggle('hidden', !shouldShow);
  dom.studentNamesSection.classList.toggle('hidden', shouldShow);
  if (!shouldShow) {
    dom.teamNamesGrid.innerHTML = '';
    return;
  }
  const names = getDraftTeamNames(config);
  dom.teamNamesGrid.innerHTML = names
    .map((name, index) => `
      <div class="name-row">
        <label for="teamName_${index}">Équipe ${index + 1}</label>
        <input id="teamName_${index}" type="text" data-team-name-index="${index}" value="${escapeHtml(name)}" maxlength="30" />
      </div>
    `)
    .join('');
}

function renderParticipantSection() {
  dom.participantCountInput.value = state.draft.participantCount;
  dom.participantCountLabel.textContent = String(state.draft.participantCount);
  renderConfigSuggestions();
  renderTeamNameFields();
  const showStudentNames = state.draft.sport === 'raquette' || state.draft.format === 'rotating-teams';
  dom.studentNamesSection.classList.toggle('hidden', !showStudentNames || (isTeamBasedDraft() && Boolean(getSelectedConfiguration())));
  dom.studentNamesInput.value = state.draft.studentNamesText;
  let oddAlert = document.getElementById('oddCountAlert');
  if (!oddAlert) {
    oddAlert = document.createElement('div');
    oddAlert.id = 'oddCountAlert';
    oddAlert.style.cssText = [
      'display:none',
      'margin-top:12px',
      'padding:12px 16px',
      'border-radius:14px',
      'background:#fef9c3',
      'border:1px solid #ca8a04',
      'color:#92400e',
      'font-weight:600',
      'font-size:0.92rem',
      'line-height:1.45',
    ].join(';');
    const anchor = dom.participantCountInput?.closest('.panel-card') || dom.configSuggestions;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(oddAlert, anchor.nextSibling);
  }
  const isIndividual = !isTeamBasedDraft();
  const isOdd = state.draft.participantCount % 2 === 1;
  if (isIndividual && isOdd) {
    oddAlert.style.display = '';
    oddAlert.textContent = `⚠️ Nombre impair (${state.draft.participantCount} joueurs) — un joueur sera exempt (bye) à chaque rotation. Prévoyez une tâche pour le joueur au repos.`;
  } else {
    oddAlert.style.display = 'none';
  }
}

function renderLadderSetupSection() {
  if (!dom.ladderSetupSection || !dom.ladderArbitratedFields || !dom.ladderPlacementGrid || !dom.ladderPlacementStatus || !dom.ladderUnplacedList) return;
  const isLadder = state.draft.sport === 'raquette' && state.draft.format === 'ladder';
  dom.ladderSetupSection.classList.toggle('hidden', !isLadder);
  if (!isLadder) {
    dom.ladderArbitratedFields.innerHTML = '';
    dom.ladderPlacementGrid.innerHTML = '';
    dom.ladderPlacementStatus.innerHTML = '';
    dom.ladderUnplacedList.innerHTML = '';
    return;
  }
  if (!Array.isArray(state.draft.ladderInitialSlots) || !state.draft.ladderInitialSlots.length) {
    resetDraftLadderInitialSlots(false);
  }
  const validation = getLadderPlacementValidation(state.draft);
  const slots = validation.slots;
  dom.ladderArbitratedFields.innerHTML = Array.from({ length: state.draft.fields }, (_, index) => {
    const field = index + 1;
    const checked = validation.arbitratedFields.includes(field);
    return `
      <label class="ladder-field-toggle">
        <input type="checkbox" data-ladder-arb-field="${field}" ${checked ? 'checked' : ''} />
        <span>T${field}</span>
      </label>
    `;
  }).join('');
  dom.ladderPlacementStatus.innerHTML = `
    <div class="ladder-placement-status ${validation.valid ? 'is-valid' : 'is-warning'}">
      <strong>${validation.valid ? 'Placement prêt' : 'Placement à corriger'}</strong>
      <span>${validation.assigned.length} placé${validation.assigned.length > 1 ? 's' : ''} · ${validation.unplaced.length} en attente</span>
      ${validation.duplicates.length ? `<span>Doublons : ${escapeHtml(validation.duplicates.map(formatDisplayName).join(', '))}</span>` : ''}
      ${validation.partialFields.length ? `<span>Terrains incomplets : ${validation.partialFields.map(field => `T${field}`).join(', ')}</span>` : ''}
    </div>
  `;
  dom.ladderPlacementGrid.innerHTML = slots.map(slot => {
    const buildSelect = role => {
      const currentValue = String(slot[role] || '').trim();
      const label = role === 'home' ? 'Joueur 1' : role === 'away' ? 'Joueur 2' : 'Arbitre';
      const availablePlayers = getAvailableLadderPlayersForSlot(state.draft, slot.field, role);
      return `
        <label class="field">
          <span>${label}</span>
          <select data-ladder-slot-field="${slot.field}" data-ladder-slot-role="${role}">
            <option value="">—</option>
            ${availablePlayers.map(name => `<option value="${escapeHtml(name)}" ${name === currentValue ? 'selected' : ''}>${escapeHtml(formatDisplayName(name))}</option>`).join('')}
          </select>
        </label>
      `;
    };
    return `
      <article class="ladder-placement-card">
        <div class="ladder-placement-head">
          <strong>Terrain ${slot.field}</strong>
          <span>${slot.hasReferee ? 'Arbitré fixe' : 'Terrain normal'}</span>
        </div>
        <div class="ladder-placement-roles">
          ${buildSelect('home')}
          ${buildSelect('away')}
          ${slot.hasReferee ? buildSelect('referee') : ''}
        </div>
      </article>
    `;
  }).join('');
  dom.ladderUnplacedList.innerHTML = validation.unplaced.length
    ? `
      <div class="ladder-unplaced-card">
        <strong>Élèves non placés</strong>
        <p>${escapeHtml(validation.unplaced.map(formatDisplayName).join(' · '))}</p>
      </div>
    `
    : `
      <div class="ladder-unplaced-card is-complete">
        <strong>Tous les élèves sont affectés</strong>
        <p>Aucun élève en attente au lancement.</p>
      </div>
    `;
}

function renderChallengeSetupSection() {
  if (!dom.challengeSetupSection || !dom.challengePlacementGrid || !dom.challengePlacementStatus || !dom.challengeUnplacedList) return;
  const isChallenge = state.draft.sport === 'raquette' && state.draft.format === 'challenge';
  dom.challengeSetupSection.classList.toggle('hidden', !isChallenge);
  if (!isChallenge) {
    dom.challengePlacementGrid.innerHTML = '';
    dom.challengePlacementStatus.innerHTML = '';
    dom.challengeUnplacedList.innerHTML = '';
    return;
  }
  if (!Array.isArray(state.draft.challengeInitialRanking) || !state.draft.challengeInitialRanking.length) {
    applyDraftChallengePlacementMode('auto');
  }
  const validation = getChallengePlacementValidation(state.draft);
  dom.challengePlacementStatus.innerHTML = `
    <div class="ladder-placement-status ${validation.valid ? 'is-valid' : 'is-warning'} challenge-placement-status">
      <strong>${validation.valid ? 'Classement prêt' : 'Classement à corriger'}</strong>
      <span>${validation.assigned.length} placé${validation.assigned.length > 1 ? 's' : ''} · ${validation.unplaced.length} en attente</span>
      ${validation.duplicates.length ? `<span>Doublons : ${escapeHtml(validation.duplicates.map(formatDisplayName).join(', '))}</span>` : ''}
    </div>
  `;
  dom.challengePlacementGrid.innerHTML = validation.ranking.map(entry => {
    const currentValue = String(entry.name || '').trim();
    const availablePlayers = getAvailableChallengePlayersForRank(state.draft, entry.rank);
    return `
      <label class="challenge-initial-ranking-row">
        <strong>Rang ${entry.rank}</strong>
        <select data-challenge-rank="${entry.rank}">
          <option value="">—</option>
          ${availablePlayers.map(name => `<option value="${escapeHtml(name)}" ${name === currentValue ? 'selected' : ''}>${escapeHtml(formatDisplayName(name))}</option>`).join('')}
        </select>
      </label>
    `;
  }).join('');
  dom.challengeUnplacedList.innerHTML = validation.unplaced.length
    ? `
      <div class="challenge-unplaced-card">
        <strong>Élèves non placés</strong>
        <p>${escapeHtml(validation.unplaced.map(formatDisplayName).join(' · '))}</p>
      </div>
    `
    : `
      <div class="challenge-unplaced-card is-complete">
        <strong>Classement prêt</strong>
        <p>Tous les élèves sont classés avant lancement.</p>
      </div>
    `;
}

function renderTimeSection() {
  dom.fieldCountInput.value = state.draft.fields;
  dom.fieldCountLabel.textContent = String(state.draft.fields);
  dom.startTimeInput.value = state.draft.startTime;
  dom.endTimeInput.value = state.draft.endTime;
  dom.matchDurationInput.value = state.draft.duration;
  dom.matchDurationLabel.textContent = `${state.draft.duration} min`;
  const config = getSelectedConfiguration();
  const effectiveCount = isTeamBasedDraft() && config ? config.teamCount : state.draft.participantCount;
  const windowResult = getAvailableWindow(state.draft);
  const availableMinutes = windowResult.availableMinutes;
  const isInverted = windowResult.invertedWarning;
  const rotationEstimate = getEstimatedRotationCount(effectiveCount, state.draft.fields, {
    teamBased: isTeamBasedDraft(),
  });
  const suggestedDuration = getSuggestedDurationFromWindow(availableMinutes, rotationEstimate, state.draft.duration);
  const slotLabel = availableMinutes == null
    ? `${state.draft.duration} min par match`
    : `${availableMinutes} min · Durée suggérée : ${suggestedDuration} min/match · ${rotationEstimate} rotations`;
  dom.timingSummary.innerHTML = isInverted
    ? `<strong style="color:#c2410c;">⚠️ Heure de fin antérieure à l'heure de début — vérifiez le créneau.</strong>`
    : availableMinutes == null
      ? `<strong>Durée</strong> : ${slotLabel}`
      : `<strong>Créneau</strong> : ${slotLabel}`;
}

function renderNewTournamentView() {
  document.querySelectorAll('[data-sport]').forEach(button => {
    button.classList.toggle('selected', button.dataset.sport === state.draft.sport);
  });
  renderFormatCards();
  renderParticipantSection();
  renderTimeSection();
  renderLadderSetupSection();
  renderChallengeSetupSection();
  dom.rotatingRefereeInput.checked = Boolean(state.draft.rotatingReferee);
  dom.scoreTableInput.checked = Boolean(state.draft.scoreTable);
  dom.sessionNameInput.value = state.draft.sessionName;
  if (dom.skipNamesStepBtn) {
    dom.skipNamesStepBtn.classList.toggle('hidden', state.draft.sport === 'raquette' && state.draft.format === 'ladder');
  }
  const rotatingRefereeRow = dom.rotatingRefereeInput?.closest('.toggle-row');
  if (rotatingRefereeRow) {
    rotatingRefereeRow.classList.toggle('hidden', state.draft.sport === 'raquette' && state.draft.format === 'ladder');
  }
  updateDraftSessionNamePlaceholder();
  const isChallenge = state.draft.format === 'challenge';
  if (dom.challengeRangeBlock) {
    dom.challengeRangeBlock.style.display = isChallenge ? '' : 'none';
    if (dom.challengeRangeInput) dom.challengeRangeInput.value = state.draft.challengeRange;
    if (dom.challengeRangeLabel) dom.challengeRangeLabel.textContent = `±${state.draft.challengeRange}`;
  }
  const isGroupPools = state.draft.format === 'groups-pools';
  if (dom.poolSizeBlock) {
    dom.poolSizeBlock.style.display = isGroupPools ? '' : 'none';
    if (dom.poolSizeInput) dom.poolSizeInput.value = state.draft.poolSize;
    if (dom.poolSizeLabel) dom.poolSizeLabel.textContent = `${state.draft.poolSize}`;
  }
  renderNewTournamentStepper();
}

function buildLaunchOptions() {
  return buildOptionsFromDraft(state.draft);
}

function buildOptionsFromDraft(source = state.draft) {
  const config = getSelectedConfigurationForSource(source);
  let ladderArbitratedFields = [];
  if (source?.sport === 'raquette' && source?.format === 'ladder') {
    ladderArbitratedFields = normalizeLadderArbitratedFieldsForSource(source);
    if (!ladderArbitratedFields.length && source?.rotatingReferee) {
      const fallbackCount = Math.min(
        clampNumber(Number(source.fields) || 2, 1, 20, 2),
        Math.floor(clampSetupCount(source.participantCount, 24) / 3)
      );
      ladderArbitratedFields = Array.from({ length: fallbackCount }, (_, index) => index + 1);
    }
  }
  return {
    sport: source.sport === 'raquette' ? 'raquette' : 'sport-co',
    format: source.format,
    fields: clampNumber(Number(source.fields) || 2, 1, 20, 2),
    startTime: source.startTime || '10:00',
    endTime: source.endTime || '11:00',
    duration: clampNumber(Number(source.duration) || 7, 1, 60, 7),
    practiceType: source.sport === 'raquette' ? 'raquette' : source.format === 'rotating-teams' ? 'eleve' : 'sport-co',
    teamSize: config?.teamSize || 3,
    organization: 'pools',
    rotatingReferee: source?.sport === 'raquette' && source?.format === 'ladder'
      ? ladderArbitratedFields.length > 0
      : Boolean(source.rotatingReferee),
    scoreTable: Boolean(source.scoreTable),
    challengeRange: clampNumber(Number(source.challengeRange) || 5, 1, 10, 5),
    poolSize: clampNumber(Number(source.poolSize) || 4, 3, 6, 4),
    ladderArbitratedFields,
    challengeInitialRanking: source?.sport === 'raquette' && source?.format === 'challenge'
      ? resolveChallengeInitialRankingForSource(source).map(entry => ({
          rank: entry.rank,
          name: entry.name,
        }))
      : [],
    ladderInitialSlots: source?.sport === 'raquette' && source?.format === 'ladder'
      ? resolveLadderInitialSlotsForSource(source).map(slot => ({
          field: slot.field,
          home: slot.home,
          away: slot.away,
          referee: slot.referee,
          hasReferee: slot.hasReferee,
        }))
      : [],
  };
}

function getActivityLabel(source = state.draft) {
  return source?.sport === 'raquette' ? 'Raquettes' : 'Sports collectifs';
}

function getFormatLabelFromSource(source = state.draft) {
  return TOURNAMENT_MODES[source?.format]?.label || source?.format || 'Tournoi';
}

function getSimulationRating(score) {
  const clamped = clampNumber(Number(score) || 1, 1, 5, 1);
  const labels = {
    5: 'Configuration très fluide',
    4: 'Configuration fluide',
    3: 'Configuration correcte',
    2: 'Configuration peu efficace',
    1: 'Configuration déconseillée',
  };
  return {
    score: clamped,
    label: labels[clamped],
    stars: `${'★'.repeat(clamped)}${'☆'.repeat(5 - clamped)}`,
  };
}

function createTeamsForDraft(source, options) {
  if (options.sport === 'raquette' && options.format === 'challenge') {
    return resolveChallengeInitialRankingForSource(source).map(entry => entry.name).filter(Boolean);
  }
  const config = getSelectedConfigurationForSource(source);
  if (options.sport === 'sport-co' && options.format !== 'rotating-teams') {
    const teamCount = config?.teamCount || 4;
    return getDraftTeamNamesForSource(source, config || { teamCount });
  }
  const count = clampSetupCount(source?.participantCount, 24);
  return getDraftStudentNamesForSource(source, count);
}

function buildSimulationReport(source = state.draft) {
  const draft = {
    ...createDefaultDraft(),
    ...(source || {}),
  };
  const options = buildOptionsFromDraft(draft);
  const teams = createTeamsForDraft(draft, options);
  const teamBased = isTeamBasedSource(draft);
  const unitCount = teams.length;
  const availableWindowResult = getAvailableWindow(draft);
  const availableMinutes = availableWindowResult.availableMinutes;
  const invertedWarning = Boolean(availableWindowResult.invertedWarning);
  const possibleRotations = availableMinutes == null ? null : Math.max(0, Math.floor(availableMinutes / Math.max(options.duration, 1)));
  const ladderCapacityBonus = draft.format === 'ladder' ? options.ladderArbitratedFields.length : 0;
  const simultaneousUnits = Math.min(unitCount, Math.max(1, options.fields) * 2 + ladderCapacityBonus);
  const waitingUnits = Math.max(unitCount - simultaneousUnits, 0);
  let schedule = null;
  let scheduleError = null;
  try {
    schedule = generateSchedule(teams, options);
  } catch (error) {
    scheduleError = error;
  }
  const requiredRotations = schedule
    ? (schedule.format === 'challenge'
      ? getEstimatedRotationCount(unitCount, options.fields, { teamBased })
      : (schedule.meta?.rotationCount || schedule.rotations?.length || 0))
    : getEstimatedRotationCount(unitCount, options.fields, { teamBased });

  const alerts = [];
  const recommendations = [];
  let ratingScore = 5;

  if (invertedWarning) {
    alerts.push({ level: 'error', text: 'Heure de fin antérieure à l’heure de début : vérifiez le créneau.' });
    ratingScore = 1;
  }
  if (availableMinutes != null && options.duration > availableMinutes) {
    alerts.push({ level: 'error', text: 'La durée d’un match est supérieure au créneau disponible.' });
    ratingScore = 1;
  }
  if (possibleRotations === 0) {
    alerts.push({ level: 'error', text: '0 rotation possible avec ce créneau et cette durée de match.' });
    ratingScore = 1;
  }
  if (availableMinutes != null && possibleRotations !== null && possibleRotations < requiredRotations && draft.format !== 'challenge') {
    alerts.push({ level: 'warning', text: `Créneau court pour ce format : environ ${possibleRotations} rotation(s) possibles pour ${requiredRotations} attendue(s).` });
    ratingScore -= possibleRotations <= Math.floor(requiredRotations / 2) ? 2 : 1;
  }
  if (waitingUnits > Math.ceil(unitCount / 3)) {
    alerts.push({ level: 'warning', text: teamBased
      ? 'Beaucoup d’équipes restent en attente : envisagez plus de terrains, des matchs plus courts ou un autre format.'
      : 'Beaucoup d’élèves restent en attente : prévoyez repos actif, observation ou davantage de terrains.' });
    ratingScore -= waitingUnits > Math.ceil(unitCount / 2) ? 2 : 1;
  }
  if (options.rotatingReferee && waitingUnits < options.fields) {
    alerts.push({ level: 'warning', text: teamBased
      ? 'Arbitre activé mais pas assez d’équipes au repos pour 1 arbitre par terrain : prévoir arbitrage croisé.'
      : 'Arbitre tournant activé mais pas assez d’élèves disponibles pour 1 arbitre par terrain.' });
    ratingScore -= 1;
  }
  if (options.scoreTable && waitingUnits === 0) {
    alerts.push({ level: 'warning', text: teamBased
      ? 'Table de marque activée sans équipe au repos : prévoir une équipe non concernée ou l’enseignant.'
      : 'Table de marque activée sans élève disponible : prévoir un responsable externe à la rotation.' });
    ratingScore -= 1;
  }
  if (scheduleError) {
    alerts.push({ level: 'warning', text: 'Cette configuration est difficile à organiser automatiquement avec le moteur actuel.' });
    ratingScore -= 1;
  }

  if (teamBased) {
    const recommendedConfig = getSelectedConfigurationForSource(draft);
    if (recommendedConfig) {
      recommendations.push(`Configuration EPS conseillée : ${recommendedConfig.teamCount} équipes — ${recommendedConfig.composition}.`);
      recommendations.push(recommendedConfig.explanation);
    }
    recommendations.push(
      waitingUnits > 0
        ? 'Si une équipe est au repos, elle peut aider pour l’arbitrage ou la table.'
        : (options.rotatingReferee
          ? 'Aucune équipe au repos : prévoir arbitrage croisé ou arbitres issus des équipes non concernées.'
          : 'Toutes les équipes peuvent jouer simultanément sur cette rotation.')
    );
    if (waitingUnits > 1) {
      recommendations.push('Si trop d’équipes attendent, ajoutez des terrains, réduisez la durée ou choisissez un format plus léger.');
    }
  } else {
    if (waitingUnits > 0) {
      recommendations.push(`${waitingUnits} élève${waitingUnits > 1 ? 's restent' : ' reste'} disponible${waitingUnits > 1 ? 's' : ''} : arbitres, observateurs, repos actif.`);
    } else {
      recommendations.push('Tous les élèves peuvent être engagés immédiatement : peu de marge pour des rôles externes.');
    }
    if (options.rotatingReferee && waitingUnits >= options.fields) {
      recommendations.push('1 arbitre par terrain possible si vous voulez sécuriser la rotation.');
    }
    if (options.scoreTable) {
      recommendations.push('Prévoyez 1 responsable classement / saisie scores.');
    }
    if (draft.participantCount % 2 === 1) {
      recommendations.push('Nombre impair : proposer automatiquement un rôle actif au joueur non engagé.');
    }
    if (draft.format === 'challenge') {
      recommendations.push(`Défi : la plage actuelle est de ±${options.challengeRange} rang${options.challengeRange > 1 ? 's' : ''}.`);
    }
    if (draft.format === 'groups-pools') {
      recommendations.push(`Poules prévues par groupes de ${options.poolSize}.`);
    }
  }

  const waitingRatio = unitCount ? waitingUnits / unitCount : 1;
  if (waitingRatio > 0.45) ratingScore -= 1;
  if (options.fields <= 1 && unitCount > 6) ratingScore -= 1;
  if (possibleRotations !== null && possibleRotations >= requiredRotations && waitingRatio <= 0.2 && !invertedWarning) {
    ratingScore = Math.max(ratingScore, 4);
  }
  if (possibleRotations !== null && possibleRotations >= requiredRotations + 2 && waitingRatio <= 0.1 && !invertedWarning) {
    ratingScore = 5;
  }

  return {
    activityLabel: getActivityLabel(draft),
    formatLabel: getFormatLabelFromSource(draft),
    unitCount,
    participantCount: clampSetupCount(draft.participantCount, 24),
    unitLabel: teamBased ? 'équipes' : 'élèves',
    fields: options.fields,
    availableMinutes,
    duration: options.duration,
    possibleRotations,
    requiredRotations,
    activeLabel: teamBased
      ? `${simultaneousUnits} équipe${simultaneousUnits > 1 ? 's peuvent' : ' peut'} jouer simultanément.`
      : `${simultaneousUnits} joueur${simultaneousUnits > 1 ? 's peuvent' : ' peut'} jouer simultanément.`,
    waitingLabel: teamBased
      ? `${waitingUnits} équipe${waitingUnits > 1 ? 's au repos.' : ' au repos.'}`
      : (waitingUnits > 0
        ? `${waitingUnits} élève${waitingUnits > 1 ? 's restent' : ' reste'} disponible${waitingUnits > 1 ? 's' : ''} : arbitres, observateurs, repos actif.`
        : '0 élève disponible hors jeu.'),
    recommendations,
    alerts,
    rating: getSimulationRating(ratingScore),
    teamBased,
  };
}

function renderSimulationPanel(report) {
  if (!dom.simulationPanel || !report) return report;
  const countLabel = `${report.unitCount} ${report.unitLabel}`;
  const windowLabel = report.availableMinutes == null ? 'Créneau à vérifier' : `${report.availableMinutes} min`;
  const rotationsLabel = report.possibleRotations == null
    ? 'Rotations possibles : créneau à vérifier.'
    : `Environ ${report.possibleRotations} rotation${report.possibleRotations > 1 ? 's' : ''} possible${report.possibleRotations > 1 ? 's' : ''}.`;
  const alertsHtml = report.alerts.map(entry => `
    <div class="simulation-alert simulation-alert--${entry.level}">${escapeHtml(entry.text)}</div>
  `).join('');
  const recommendationsHtml = report.recommendations.map(entry => `<li>${escapeHtml(entry)}</li>`).join('');
  dom.simulationPanel.innerHTML = `
    <div class="simulation-panel-card">
      <div class="simulation-panel-head">
        <div>
          <p class="simulation-kicker">📊 Analyse rapide de la séance</p>
          <h3>${escapeHtml(report.activityLabel)} · ${escapeHtml(report.formatLabel)}</h3>
        </div>
        <div class="simulation-rating" aria-label="${escapeHtml(report.rating.label)}">
          <strong>${report.rating.stars}</strong>
          <span>${escapeHtml(report.rating.label)}</span>
        </div>
      </div>
      <div class="simulation-metrics">
        <span class="simulation-pill">${escapeHtml(countLabel)}</span>
        <span class="simulation-pill">${report.fields} terrain${report.fields > 1 ? 's' : ''}</span>
        <span class="simulation-pill">Créneau : ${escapeHtml(windowLabel)}</span>
        <span class="simulation-pill">Match : ${report.duration} min</span>
      </div>
      <div class="simulation-summary">
        <p>${escapeHtml(report.activeLabel)}</p>
        <p>${escapeHtml(report.waitingLabel)}</p>
        <p>${escapeHtml(rotationsLabel)}</p>
      </div>
      ${alertsHtml}
      <div class="simulation-advice">
        <h4>Organisation conseillée</h4>
        <ul>${recommendationsHtml}</ul>
      </div>
    </div>
  `;
  dom.simulationPanel.classList.remove('hidden');
  return report;
}

function hideSimulationPanel() {
  if (!dom.simulationPanel) return;
  dom.simulationPanel.classList.add('hidden');
  dom.simulationPanel.innerHTML = '';
}

function renderHelpTabs(activeTab = runtime.helpTab || 'start') {
  runtime.helpTab = activeTab;
  document.querySelectorAll('[data-help-tab]').forEach(button => {
    const isActive = button.dataset.helpTab === activeTab;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  document.querySelectorAll('[data-help-panel]').forEach(panel => {
    const isActive = panel.dataset.helpPanel === activeTab;
    panel.classList.toggle('is-active', isActive);
    panel.hidden = !isActive;
  });
}

function simulateCurrentDraft() {
  const report = buildSimulationReport(state.draft);
  renderSimulationPanel(report);
  return report;
}

function createSessionName(options) {
  const trimmed = String(state.draft.sessionName || '').trim();
  if (trimmed) return trimmed;
  const sportLabel = options.sport === 'raquette' ? 'Badminton' : 'Tournoi';
  const formatLabel = getCurrentFormatDefinition().title;
  return `${sportLabel} · ${formatLabel} · ${new Date().toLocaleDateString('fr-FR')}`;
}

function createTeamsForLaunch(options) {
  return createTeamsForDraft(state.draft, options);
}

function validateDraftBeforeLaunch(options, teams) {
  if (options.format === 'challenge') {
    const validation = getChallengePlacementValidation(state.draft);
    if (validation.duplicates.length || validation.unknown.length || validation.unplaced.length || validation.assigned.length !== validation.players.length) {
      return {
        valid: false,
        message: [
          validation.unplaced.length ? `${validation.unplaced.length} élève${validation.unplaced.length > 1 ? 's non placés' : ' non placé'}` : '',
          validation.duplicates.length ? `Doublons : ${validation.duplicates.map(formatDisplayName).join(', ')}` : '',
        ].filter(Boolean).join(' · '),
      };
    }
    const rankingNames = validation.ranking.map(entry => entry.name).filter(Boolean);
    const knownPlayers = new Set(teams);
    const invalidPlayers = rankingNames.filter(name => !knownPlayers.has(name));
    if (invalidPlayers.length) {
      return {
        valid: false,
        message: `Noms hors liste : ${[...new Set(invalidPlayers)].map(formatDisplayName).join(', ')}`,
      };
    }
    return { valid: true };
  }
  if (options.format !== 'ladder') {
    return { valid: true };
  }
  const validation = getLadderPlacementValidation(state.draft);
  const activeFieldCount = validation.slots.filter(slot => slot.home && slot.away && (!slot.hasReferee || slot.referee)).length;
  const requiredArbitrated = validation.arbitratedFields.filter(field => {
    const slot = validation.slots.find(entry => entry.field === field);
    return !slot || !slot.home || !slot.away || !slot.referee;
  });
  if (validation.duplicates.length || validation.unknown.length || validation.partialFields.length || requiredArbitrated.length || validation.unplaced.length || activeFieldCount === 0) {
    return {
      valid: false,
      message: [
        activeFieldCount === 0 ? 'Aucun terrain Ladder complet au lancement.' : '',
        validation.unplaced.length ? `${validation.unplaced.length} élève${validation.unplaced.length > 1 ? 's non placés' : ' non placé'}` : '',
        validation.duplicates.length ? `Doublons : ${validation.duplicates.map(formatDisplayName).join(', ')}` : '',
        validation.partialFields.length ? `Terrains incomplets : ${validation.partialFields.map(field => `T${field}`).join(', ')}` : '',
        requiredArbitrated.length ? `Terrains arbitres à compléter : ${requiredArbitrated.map(field => `T${field}`).join(', ')}` : '',
      ].filter(Boolean).join(' · '),
    };
  }
  const knownPlayers = new Set(teams);
  const invalidPlayers = validation.slots.flatMap(slot => [slot.home, slot.away, slot.referee].filter(Boolean)).filter(name => !knownPlayers.has(name));
  if (invalidPlayers.length) {
    return {
      valid: false,
      message: `Noms hors liste : ${[...new Set(invalidPlayers)].map(formatDisplayName).join(', ')}`,
    };
  }
  return { valid: true };
}

async function launchTournament() {
  try {
    const options = buildLaunchOptions();
    const teams = createTeamsForLaunch(options);
    const draftValidation = validateDraftBeforeLaunch(options, teams);
    if (!draftValidation.valid) {
      const setupLabel = options.format === 'challenge' ? 'Classement Défi incomplet.' : 'Placement Ladder incomplet.';
      window.alert(`${setupLabel} ${draftValidation.message}`);
      return;
    }
    const schedule = generateSchedule(teams, options);
    const session = {
      id: uniqueId('session'),
      createdAt: new Date().toISOString(),
      savedAt: new Date().toISOString(),
      name: createSessionName(options),
      sport: options.sport,
      format: options.format,
      teams: [...teams],
      schedule,
      scores: {},
      currentRotation: 0,
      options: {
        fields: options.fields,
        duration: options.duration,
        startTime: options.startTime,
        endTime: options.endTime,
        teamSize: options.teamSize,
        poolSize: options.poolSize,
        rotatingReferee: options.rotatingReferee,
        scoreTable: options.scoreTable,
        challengeRange: options.challengeRange,
        challengeInitialRanking: cloneData(options.challengeInitialRanking || []),
        ladderArbitratedFields: cloneData(options.ladderArbitratedFields || []),
        ladderInitialSlots: cloneData(options.ladderInitialSlots || []),
      },
      completed: false,
    };
    if (session.format === 'challenge') {
      session.challengeOrder = (options.challengeInitialRanking || []).map(entry => entry.name).filter(Boolean);
      session.challengeLog = [];
      session.options.challengeRange = options.challengeRange || 5;
    }
    const classroomChoice = await promptClassroomChoice();
    if (classroomChoice) {
      const classroom = getClassroomById(classroomChoice);
      session.classroomId = classroom?.id || null;
      session.classroomName = classroom?.name || null;
    } else {
      session.classroomId = null;
      session.classroomName = null;
    }
    state.currentSession = session;
    resetTimer();
    saveSessionLocally(session);
    showView('live');
  } catch (error) {
    console.error('[launchTournament] Génération impossible.', error);
    window.alert('Impossible de générer la séance avec ces paramètres. Vérifiez le nombre de participants, les terrains, la durée et le créneau.');
  }
}

/* === Vue 4 — pilotage live === */

function getSessionCurrentRotationCount(session) {
  const rotationsLength = session?.schedule?.rotations?.length || 0;
  const metaCount = session?.schedule?.meta?.rotationCount || 0;
  if (session?.format === 'swiss' || session?.format === 'ladder') {
    if (metaCount && metaCount !== rotationsLength) {
      console.warn(`[getSessionCurrentRotationCount] ${session.format} utilise ${rotationsLength} rotation(s) navigable(s), meta.rotationCount=${metaCount}.`);
    }
    return rotationsLength;
  }
  return metaCount || rotationsLength || 0;
}

function resetTimer() {
  clearInterval(runtime.timerInterval);
  runtime.timerInterval = null;
  const durationSeconds = (state.currentSession?.options?.duration || 7) * 60;
  state.timer.totalSeconds = durationSeconds;
  state.timer.remainingSeconds = durationSeconds;
  state.timer.running = false;
  renderTimer();
  persistState();
}

function renderTimer() {
  if (!dom.timerLabel) return;
  const total = Math.max(state.timer.totalSeconds, 1);
  const remaining = Math.max(state.timer.remainingSeconds, 0);
  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
  const seconds = String(remaining % 60).padStart(2, '0');
  dom.timerLabel.textContent = `⏱ ${minutes}:${seconds}`;
  dom.timerStatus.textContent = state.timer.running ? 'En cours' : remaining === total ? 'Prêt' : remaining === 0 ? 'Terminé' : 'Pause';
  dom.timerProgressBar.style.width = `${((total - remaining) / total) * 100}%`;
}

function startTimer() {
  if (state.timer.running) return;
  state.timer.running = true;
  renderTimer();
  runtime.timerInterval = window.setInterval(() => {
    state.timer.remainingSeconds = Math.max(0, state.timer.remainingSeconds - 1);
    if (state.timer.remainingSeconds === 0) {
      if (typeof AudioContext !== 'undefined') {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc.start(); osc.stop(ctx.currentTime + 0.8);
      }
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      pauseTimer();
    }
    renderTimer();
  }, 1000);
}

function pauseTimer() {
  state.timer.running = false;
  clearInterval(runtime.timerInterval);
  runtime.timerInterval = null;
  renderTimer();
}

function isCurrentRotationEditable(session, rotationIndex) {
  return rotationIndex === session.currentRotation;
}

function adjustScore(matchId, side, delta) {
  const session = state.currentSession;
  if (!session) return;
  const current = getScoreRecord(session, matchId);
  if (!current && delta < 0) return;
  const base = current || createExplicitScoreRecord(0, 0);
  const nextValue = Math.max(0, Number(base[side] || 0) + delta);
  session.scores[matchId] = createExplicitScoreRecord(
    side === 'home' ? nextValue : Number(base.home || 0),
    side === 'away' ? nextValue : Number(base.away || 0)
  );
  saveSessionLocally(session);
  renderLiveView();
}

function validateZeroScore(matchId) {
  const session = state.currentSession;
  if (!session) return;
  const existing = getScoreRecord(session, matchId);
  const hasAnyScore = existing && (existing.home != null || existing.away != null);
  const isNonZero = hasAnyScore && (existing.home !== 0 || existing.away !== 0);
  if (hasAnyScore && isNonZero) {
    if (!window.confirm(`Un score ${existing.home}-${existing.away} est déjà saisi. Remplacer par 0-0 ?`)) return;
  }
  session.scores[matchId] = createExplicitScoreRecord(0, 0);
  saveSessionLocally(session);
  renderLiveView();
}

function setLadderOutcome(matchId, winnerSide) {
  const session = state.currentSession;
  if (!session || session.format !== 'ladder') return;
  if (winnerSide !== 'home' && winnerSide !== 'away') return;
  session.scores[matchId] = createExplicitScoreRecord(
    winnerSide === 'home' ? 1 : 0,
    winnerSide === 'away' ? 1 : 0
  );
  saveSessionLocally(session);
  renderLiveView();
}

function clearLadderOutcome(matchId) {
  const session = state.currentSession;
  if (!session || session.format !== 'ladder') return;
  const rotation = getCurrentRotation(session);
  if (!rotation || !rotation.matches.some(match => match.id === matchId)) return;
  delete session.scores[matchId];
  saveSessionLocally(session);
  renderLiveView();
}

function setRotatingOutcome(matchId, outcome) {
  const session = state.currentSession;
  if (!session) return;
  if (outcome === 'home') {
    session.scores[matchId] = createExplicitScoreRecord(1, 0);
  } else if (outcome === 'away') {
    session.scores[matchId] = createExplicitScoreRecord(0, 1);
  } else {
    session.scores[matchId] = createExplicitScoreRecord(1, 1);
  }
  saveSessionLocally(session);
  renderLiveView();
}

function autoSave() {
  if (!state.currentSession) return;
  saveSessionLocally(state.currentSession);
}

function finishTournament() {
  if (!state.currentSession) return;
  state.currentSession.completed = true;
  if (state.currentSession.classroomId) {
    const classroom = getClassroomById(state.currentSession.classroomId);
    if (classroom) {
      const stats = computeStudentStatsFromSession(state.currentSession);
      mergeStudentIntoClassroom(classroom, stats, state.currentSession.id);
      upsertClassroom(classroom);
    }
  }
  saveSessionLocally(state.currentSession);
  showView('summary');
}

function renderRankingDrawer(session) {
  if (!dom.liveRankingContent) return;
  const standings = computeStandings(session);
  if (!standings.length) {
    dom.liveRankingContent.innerHTML = '<div class="empty-state">Aucun résultat saisi pour le moment.</div>';
    return;
  }
  dom.liveRankingContent.innerHTML = renderStandingsTable(session, standings);
}

function applyChallengeResult(session, challengerIdx, targetIdx, scores) {
  if (!session || !Array.isArray(session.challengeOrder)) return session;
  const co = session.challengeOrder;
  const challengerName = co[challengerIdx];
  const targetName = co[targetIdx];
  if (!challengerName || !targetName) return session;
  const safeScores = {
    home: Math.max(0, Number(scores?.home) || 0),
    away: Math.max(0, Number(scores?.away) || 0),
  };
  const isDraw = safeScores.home === safeScores.away;
  const challengerWon = !isDraw && safeScores.away > safeScores.home;
  session.challengeLog.push({
    challenger: challengerName,
    target: targetName,
    challengerRank: challengerIdx + 1,
    targetRank: targetIdx + 1,
    challengerScore: safeScores.away,
    targetScore: safeScores.home,
    challengerWon,
    isDraw,
    ts: Date.now(),
  });
  if (challengerWon) {
    const newOrder = [...co];
    newOrder[targetIdx] = challengerName;
    newOrder[challengerIdx] = targetName;
    session.challengeOrder = newOrder;
  }
  return session;
}

function getChallengeOpponentIndexes(orderLength, selectedIdx, challengeRange) {
  if (!Number.isInteger(orderLength) || orderLength <= 1) return [];
  if (!Number.isInteger(selectedIdx) || selectedIdx < 0 || selectedIdx >= orderLength) return [];
  const safeRange = clampNumber(Number(challengeRange) || 0, 0, orderLength - 1, 0);
  const minIndex = Math.max(0, selectedIdx - safeRange);
  const maxIndex = Math.min(orderLength - 1, selectedIdx + safeRange);
  const opponents = [];
  for (let idx = minIndex; idx <= maxIndex; idx += 1) {
    if (idx !== selectedIdx) opponents.push(idx);
  }
  return opponents;
}

function applyChallengeWinner(session, firstIdx, secondIdx, winnerIdx) {
  if (!session || !Array.isArray(session.challengeOrder)) return session;
  if (firstIdx === secondIdx) return session;
  const challengerIdx = Math.max(firstIdx, secondIdx);
  const targetIdx = Math.min(firstIdx, secondIdx);
  const challengerWon = winnerIdx === challengerIdx;
  return applyChallengeResult(session, challengerIdx, targetIdx, {
    home: challengerWon ? 0 : 1,
    away: challengerWon ? 1 : 0,
  });
}

function formatChallengeStatsLine(row) {
  if (!row) return '0 défi · 0 pt';
  const defis = row.played || 0;
  const points = row.points || 0;
  if (!defis) return '0 défi · 0 pt';
  return `${defis} défi${defis > 1 ? 's' : ''} · ${points} pt${points > 1 ? 's' : ''} · ${row.pointsFor || 0}/${row.pointsAgainst || 0}`;
}

function buildChallengeListMarkup(session, challengeRange) {
  const order = Array.isArray(session.challengeOrder) && session.challengeOrder.length
    ? session.challengeOrder
    : session.schedule.teams.map(t => t.name);
  const standings = computeStandings(session);
  const statsByName = new Map(standings.map(row => [row.name, row]));
  return order.map((name, idx) => `
    <button class="challenge-row challenge-row-compact" type="button" data-challenge-index="${idx}" title="Rang ${idx + 1} — match autorisé dans la plage ±${challengeRange}">
      <span class="challenge-rank">${idx + 1}</span>
      <span class="challenge-copy">
        <span class="challenge-name">${escapeHtml(formatDisplayName(name))}</span>
        <span class="challenge-stats">${escapeHtml(formatChallengeStatsLine(statsByName.get(name)))}</span>
      </span>
      <span class="challenge-action">${idx === 0 ? '' : '⚔️'}</span>
    </button>
  `).join('');
}

function getChallengeGridLayout(participantCount) {
  const safeCount = Math.max(1, Number(participantCount) || 1);
  return {
    desktopColumns: 3,
    tabletColumns: 2,
    mobileColumns: 1,
    desktopRows: Math.ceil(safeCount / 3),
    tabletRows: Math.ceil(safeCount / 2),
    mobileRows: safeCount,
  };
}

function toggleChallengeLiveMode(enabled) {
  const liveView = document.getElementById('view-live');
  const liveHeader = document.getElementById('liveHeader');
  const liveFooter = document.querySelector('#view-live .footer-actions.split');
  const finishBtn = document.getElementById('finishTournamentBtn');
  [liveView, liveHeader, liveFooter, dom.liveMatches, finishBtn].forEach(node => {
    if (!node || !node.classList) return;
    node.classList.toggle('challenge-live-mode', Boolean(enabled));
  });
}

function getRoleBadgeStyle(role) {
  if (role === 'Arbitre') return 'background:rgba(249,115,22,0.14);color:#c2410c;border:1px solid rgba(249,115,22,0.3);';
  if (role === 'Table') return 'background:rgba(59,130,246,0.14);color:#1d4ed8;border:1px solid rgba(59,130,246,0.3);';
  return 'background:rgba(15,23,42,0.06);color:var(--text-soft);border:1px solid rgba(148,163,184,0.25);';
}

function getUnavailableRotationRoles(rotation, byeAssignments, enabledRoles) {
  const assignedRoles = new Set();
  (rotation?.matches || []).forEach(match => {
    if (match?.referee || match?.ladderReferee) assignedRoles.add('Arbitre');
  });
  (byeAssignments || []).forEach(entry => {
    if (entry?.role) assignedRoles.add(entry.role);
  });
  return (enabledRoles || []).filter(role => role && role !== 'Spectateur actif' && !assignedRoles.has(role));
}

function renderByeAssignmentsBlock(assignments, session) {
  if (!Array.isArray(assignments) || !assignments.length) return '';
  const restCount = assignments.length;
  const restLine = `${restCount} ${getParticipantLabel(session, restCount).toLowerCase()} en repos actif cette ${session?.format === 'swiss' ? 'ronde' : 'rotation'}.`;
  const roleLine = assignments.map(entry => entry.role).filter(Boolean).join(' / ');
  return `<div class="live-rest-card">
    <p class="live-rest-title">Repos actif</p>
    <p class="live-rest-summary">${escapeHtml(restLine)}</p>
    <p class="live-rest-role-line">Rôle proposé : ${escapeHtml(roleLine)}</p>
    <div class="live-rest-assignments">
      ${assignments.map(entry => `
        <div class="live-rest-item">
          <span class="live-rest-role">${escapeHtml(entry.role)} :</span>
          <strong>${escapeHtml(session && session.sport === 'sport-co' && session.format !== 'rotating-teams' ? entry.name : formatDisplayName(entry.name))}</strong>
        </div>
      `).join('')}
    </div>
   </div>`;
}

function renderLiveMatches(session) {
  if (!dom.liveMatches) return;
  const rotation = getCurrentRotation(session);
  if (!rotation) {
    dom.liveMatches.innerHTML = '<div class="empty-state">Aucune rotation disponible.</div>';
    return;
  }
  const editable = isCurrentRotationEditable(session, session.currentRotation);
  const enabledRoles = getEnabledRolesFromOptions(session.options || {});
  const exemptSet = new Set(rotation.byes || []);
  const byeAssignments = Array.isArray(rotation.byeAssignments) && rotation.byeAssignments.length
    ? rotation.byeAssignments
    : assignRolesForByes([...exemptSet], enabledRoles);
  const visibleMatches = rotation.matches.filter(match => {
    const p = resolveMatchParticipants(match, session);
    if (p.home === 'Exempt') { exemptSet.add(p.away); return false; }
    if (p.away === 'Exempt') { exemptSet.add(p.home); return false; }
    return true;
  });
  const exemptPlayers = [...exemptSet];

  const matchesHtml = visibleMatches.map(match => {
    const participants = resolveMatchParticipants(match, session);
    const record = getScoreRecord(session, match.id);
    const complete = isScoreComplete(record);
    const subtitle = match.groupLabel ? `${match.groupLabel}` : rotation.title;
    const terrainBadge = session.format === 'ladder'
      ? (match.hasReferee
        ? `<span style="font-size:0.75rem;padding:2px 8px;border-radius:999px;background:rgba(249,115,22,0.12);color:#c2410c;border:1px solid rgba(249,115,22,0.25);font-weight:700;">Arbitré</span>`
        : `<span style="font-size:0.75rem;padding:2px 8px;border-radius:999px;background:rgba(148,163,184,0.12);color:var(--text-soft);border:1px solid rgba(148,163,184,0.25);font-weight:700;">Libre</span>`)
      : '';
    if (session.format === 'rotating-teams') {
      const selectedOutcome = complete ? (record.home > record.away ? 'home' : record.away > record.home ? 'away' : 'draw') : '';
      return `
        <article class="live-card ${complete ? '' : 'live-card--incomplete'}">
          <div class="live-card-head">
            <div>
              <p class="section-kicker">Terrain ${match.field}</p>
              ${terrainBadge}
              <h3>${escapeHtml(subtitle)}</h3>
            </div>
          </div>
          <div class="rotating-side">${escapeHtml((match.homePlayers || []).map(name => formatDisplayName(name)).join(' · '))}</div>
          <div class="vs-badge">vs</div>
          <div class="rotating-side">${escapeHtml((match.awayPlayers || []).map(name => formatDisplayName(name)).join(' · '))}</div>
          <div class="team-result-stack">
            <button class="team-result-btn ${selectedOutcome === 'home' ? 'selected' : ''}" type="button" data-rotating-outcome="home" data-match-id="${match.id}" ${editable ? '' : 'disabled'}>Équipe locale gagne</button>
            <button class="team-result-btn ${selectedOutcome === 'away' ? 'selected' : ''}" type="button" data-rotating-outcome="away" data-match-id="${match.id}" ${editable ? '' : 'disabled'}>Visiteurs gagnent</button>
            <button class="team-result-btn ${selectedOutcome === 'draw' ? 'selected' : ''}" type="button" data-rotating-outcome="draw" data-match-id="${match.id}" ${editable ? '' : 'disabled'}>Match nul</button>
          </div>
        </article>
      `;
    }
    const displayHome = session.sport === 'raquette' ? formatDisplayName(participants.home) : participants.home;
    const displayAway = session.sport === 'raquette' ? formatDisplayName(participants.away) : participants.away;
    if (session.format === 'ladder') {
      const winnerSide = complete && record.home !== record.away
        ? (record.home > record.away ? 'home' : 'away')
        : '';
      const winnerLabel = winnerSide === 'home' ? displayHome : winnerSide === 'away' ? displayAway : '';
      const hasLegacyDraw = complete && record.home === record.away;
      const resultButtons = `
        <div class="team-result-stack ladder-result-stack">
          <button class="team-result-btn ${winnerSide === 'home' ? 'selected' : ''}" type="button" data-ladder-result="home" data-match-id="${match.id}" ${editable && !participants.unresolved && !complete ? '' : 'disabled'}>${escapeHtml(displayHome)} gagne</button>
          <button class="team-result-btn ${winnerSide === 'away' ? 'selected' : ''}" type="button" data-ladder-result="away" data-match-id="${match.id}" ${editable && !participants.unresolved && !complete ? '' : 'disabled'}>${escapeHtml(displayAway)} gagne</button>
        </div>
      `;
      const correctionAction = complete && editable
        ? `<div class="live-card-actions"><button class="btn btn-secondary btn-sm" type="button" data-ladder-clear="${match.id}">Corriger</button></div>`
        : '';
      const extraInfo = [
        match.ladderReferee ? `<p style="margin:10px 0 0;color:#c2410c;font-weight:700;">🟠 Arbitre : ${escapeHtml(formatDisplayName(match.ladderReferee))}</p>` : '',
        winnerLabel ? `<p class="score-status-badge ladder-win">✓ ${escapeHtml(winnerLabel)} gagne</p>` : '',
        hasLegacyDraw ? '<p class="score-status-badge ladder-alert">Résultat nul déjà enregistré</p>' : '',
      ].filter(Boolean).join('');
      return `
        <article class="live-card ${complete ? 'live-card--validated' : 'live-card--incomplete'}">
          <div class="live-card-head">
            <div>
              <p class="section-kicker">Terrain ${match.field}</p>
              ${terrainBadge}
              <h3>${escapeHtml(subtitle)}</h3>
            </div>
          </div>
          <div class="rotating-side">${escapeHtml(displayHome)}</div>
          <div class="vs-badge">contre</div>
          <div class="rotating-side">${escapeHtml(displayAway)}</div>
          ${resultButtons}
          ${correctionAction}
          ${extraInfo}
        </article>
      `;
    }
    const homeScore = record ? record.home : '—';
    const awayScore = record ? record.away : '—';
    const zeroValidated = complete && record.home === 0 && record.away === 0;
    const extraInfo = [
      match.referee ? `<p style="margin:8px 0 0;color:#c2410c;font-weight:700;font-size:0.88rem;">Arbitre : ${escapeHtml(session.sport === 'raquette' ? formatDisplayName(match.referee) : match.referee)}</p>` : '',
      match.ladderReferee ? `<p style="margin:10px 0 0;color:#c2410c;font-weight:700;">🟠 Arbitre : ${escapeHtml(formatDisplayName(match.ladderReferee))}</p>` : '',
      match.swissNote ? `<p class="live-match-note">${escapeHtml(match.swissNote)}</p>` : '',
      zeroValidated ? '<p class="score-status-badge confirmed-draw">0-0 validé</p>' : '',
    ].filter(Boolean).join('');
    return `
      <article class="live-card ${complete ? '' : 'live-card--incomplete'}">
        <div class="live-card-head">
          <div>
            <p class="section-kicker">Terrain ${match.field}</p>
            ${terrainBadge}
            <h3>${escapeHtml(subtitle)}</h3>
          </div>
        </div>
        <div class="score-row">
          <div class="score-name">${escapeHtml(displayHome)}</div>
          <button class="score-btn" type="button" data-score-step="-1" data-score-side="home" data-match-id="${match.id}" ${editable && !participants.unresolved ? '' : 'disabled'}>−</button>
          <div class="score-value">${homeScore}</div>
          <button class="score-btn" type="button" data-score-step="1" data-score-side="home" data-match-id="${match.id}" ${editable && !participants.unresolved ? '' : 'disabled'}>+</button>
          <div></div>
        </div>
        <div class="vs-badge">──</div>
        <div class="score-row">
          <div class="score-name">${escapeHtml(displayAway)}</div>
          <button class="score-btn" type="button" data-score-step="-1" data-score-side="away" data-match-id="${match.id}" ${editable && !participants.unresolved ? '' : 'disabled'}>−</button>
          <div class="score-value">${awayScore}</div>
          <button class="score-btn" type="button" data-score-step="1" data-score-side="away" data-match-id="${match.id}" ${editable && !participants.unresolved ? '' : 'disabled'}>+</button>
          <div></div>
        </div>
        <div class="live-card-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-score-zero="${match.id}" ${editable && !participants.unresolved ? '' : 'disabled'}>Valider 0-0</button>
        </div>
        ${extraInfo}
      </article>
    `;
  }).join('');

  const effectiveByeAssignments =
    (Array.isArray(rotation.byeAssignments) && rotation.byeAssignments.length)
      ? rotation.byeAssignments
      : assignRolesForByes(exemptPlayers, enabledRoles);
  const exemptHtml = renderByeAssignmentsBlock(effectiveByeAssignments, session);
  const unavailableRoles = !exemptPlayers.length ? getUnavailableRotationRoles(rotation, effectiveByeAssignments, enabledRoles) : [];
  const noRestMessage = unavailableRoles.length
    ? `<div style="margin-top:16px;padding:14px 16px;border-radius:16px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.22);color:#1e3a8a;font-weight:600;">ℹ️ Aucun ${getParticipantLabel(session, 1).toLowerCase()} au repos cette rotation : ${escapeHtml(unavailableRoles.join(' / '))} non attribué${unavailableRoles.length > 1 ? 's' : ''}.</div>`
    : '';
  const warningHtml = rotation.warningMessage
    ? `<div style="margin-bottom:12px;padding:12px 16px;border-radius:14px;background:#fef9c3;border:1px solid #ca8a04;color:#92400e;font-weight:700;">${escapeHtml(rotation.warningMessage)}</div>`
    : '';
  dom.liveMatches.innerHTML = warningHtml + matchesHtml + exemptHtml + noRestMessage;
}

function renderChallengeLive(session) {
  if (!dom.liveMatches || !dom.nextRotationBtn) return;
  dom.liveModeLabel.textContent = 'Défi';
  dom.liveSessionTitle.textContent = session.name;
  const logCount = session.challengeLog?.length || 0;
  dom.liveRotationLabel.textContent = `${logCount} défi${logCount > 1 ? 's' : ''} joué${logCount > 1 ? 's' : ''}`;

  dom.timerStatus.textContent = 'Libre';
  dom.timerLabel.textContent = '⏱ —';
  dom.timerProgressBar.style.width = '0%';
  dom.timerStartBtn.disabled = true;
  dom.timerPauseBtn.disabled = true;
  dom.timerResetBtn.disabled = true;
  dom.prevRotationBtn.disabled = true;
  if (!dom.nextRotationBtn._challengeHandlerSet) {
    dom.nextRotationBtn.addEventListener('click', () => {
      if (state.currentSession?.format === 'challenge') finishTournament();
    });
    dom.nextRotationBtn._challengeHandlerSet = true;
  }
  dom.nextRotationBtn.textContent = '🏁 Terminer';
  dom.nextRotationBtn.disabled = false;

  const challengeRange = session.options.challengeRange || 5;
  session.challengeOrder = Array.isArray(session.challengeOrder) && session.challengeOrder.length
    ? session.challengeOrder
    : session.schedule.teams.map(t => t.name);
  const challengeLayout = getChallengeGridLayout(session.challengeOrder.length);
  toggleChallengeLiveMode(true);

  dom.liveMatches.innerHTML = `
    <div class="challenge-board">
      <p id="challengeHint" style="color:var(--text-soft);margin-bottom:12px;min-height:1.4em;transition:color 0.2s;">
        Tape sur un joueur pour voir ses adversaires possibles dans la plage ±${challengeRange}.
      </p>
      <div class="challenge-list challenge-list-dense" id="challengeList" style="--challenge-rows-desktop:${challengeLayout.desktopRows};--challenge-rows-tablet:${challengeLayout.tabletRows};--challenge-rows-mobile:${challengeLayout.mobileRows};">
        ${buildChallengeListMarkup(session, challengeRange)}
      </div>
    </div>
    <div class="challenge-modal challenge-result-modal hidden" id="challengeModal">
      <div class="challenge-modal-inner">
        <p class="section-kicker">Résultat du défi</p>
        <h3 id="challengerTitle"></h3>
        <p id="challengeTargetLabel"></p>
        <p class="challenge-result-help">Si le joueur le moins bien classé gagne, il prend la place du joueur mieux classé.</p>
        <div class="challenge-result-actions">
          <button class="btn btn-primary btn-lg challenge-result-btn" type="button" id="challengeFirstWinBtn"></button>
          <button class="btn btn-primary btn-lg challenge-result-btn" type="button" id="challengeSecondWinBtn"></button>
          <button class="btn btn-secondary btn-lg challenge-result-btn" type="button" id="challengeCancelBtn">Annuler</button>
        </div>
      </div>
    </div>
  `;

  if (typeof window._challengeHighlightTimeout !== 'undefined' && window._challengeHighlightTimeout) {
    clearTimeout(window._challengeHighlightTimeout);
    window._challengeHighlightTimeout = null;
  }
  let highlightTimeout = null;
  let selectedChallengerIdx = null;

  function clearHighlight() {
    if (window._challengeHighlightTimeout) { clearTimeout(window._challengeHighlightTimeout); window._challengeHighlightTimeout = null; highlightTimeout = null; }
    else if (highlightTimeout) { clearTimeout(highlightTimeout); highlightTimeout = null; }
    selectedChallengerIdx = null;
    document.querySelectorAll('#challengeList .challenge-row').forEach(btn => {
      btn.classList.remove('challenge-selected', 'challenge-target', 'challenge-challenger', 'challenge-dimmed', 'challenge-row-selected', 'challenge-row-available', 'challenge-row-unavailable');
    });
    const hint = document.getElementById('challengeHint');
    if (hint) {
      hint.textContent = `Tape sur un joueur pour voir ses adversaires possibles dans la plage ±${challengeRange}.`;
      hint.style.color = 'var(--text-soft)';
    }
  }

  function openResultModal(firstIdx, secondIdx) {
    clearHighlight();
    const currentOrder = session.challengeOrder;
    const firstName = currentOrder[firstIdx];
    const secondName = currentOrder[secondIdx];
    const modal = document.getElementById('challengeModal');
    const challengerTitle = document.getElementById('challengerTitle');
    const challengeTargetLabel = document.getElementById('challengeTargetLabel');
    const challengeFirstWinBtn = document.getElementById('challengeFirstWinBtn');
    const challengeSecondWinBtn = document.getElementById('challengeSecondWinBtn');
    const challengeCancelBtn = document.getElementById('challengeCancelBtn');
    if (!modal || !challengerTitle || !challengeTargetLabel || !challengeFirstWinBtn || !challengeSecondWinBtn || !challengeCancelBtn) {
      console.warn('[renderChallengeLive] Éléments de la modale défi introuvables.');
      return;
    }
    challengerTitle.textContent = `${formatDisplayName(firstName)} (rang ${firstIdx + 1}) contre ${formatDisplayName(secondName)} (rang ${secondIdx + 1})`;
    challengeTargetLabel.textContent = 'Choisis directement le vainqueur du défi.';
    challengeFirstWinBtn.textContent = `Victoire de ${formatDisplayName(firstName)}`;
    challengeSecondWinBtn.textContent = `Victoire de ${formatDisplayName(secondName)}`;
    modal.classList.remove('hidden');

    const commitResult = winnerIdx => {
      applyChallengeWinner(session, firstIdx, secondIdx, winnerIdx);
      modal.classList.add('hidden');
      autoSave();
      renderChallengeLive(session);
      renderRankingDrawer(session);
      const winnerName = session.challengeOrder.includes(currentOrder[winnerIdx]) ? currentOrder[winnerIdx] : (winnerIdx === firstIdx ? firstName : secondName);
      const hint = document.getElementById('challengeHint');
      if (hint) {
        hint.textContent = `${formatDisplayName(winnerName)} remporte le défi.`;
        hint.style.color = 'var(--accent-dark)';
        window._challengeHighlightTimeout = highlightTimeout = setTimeout(() => {
          const nextHint = document.getElementById('challengeHint');
          if (nextHint) {
            nextHint.textContent = `Tape sur un joueur pour voir ses adversaires possibles dans la plage ±${challengeRange}.`;
            nextHint.style.color = 'var(--text-soft)';
          }
        }, 3000);
      }
    };

    challengeFirstWinBtn.onclick = () => {
      commitResult(firstIdx);
    };
    challengeSecondWinBtn.onclick = () => {
      commitResult(secondIdx);
    };

    challengeCancelBtn.onclick = () => {
      modal.classList.add('hidden');
    };
  }

  const challengeListEl = document.getElementById('challengeList');
  if (!challengeListEl) {
    console.warn('[renderChallengeLive] Liste des défis introuvable.');
    return;
  }
  challengeListEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-challenge-index]');
    if (!btn) return;
    const clickedIdx = Number(btn.dataset.challengeIndex);

    if (btn.classList.contains('challenge-row-available') && selectedChallengerIdx !== null) {
      openResultModal(selectedChallengerIdx, clickedIdx);
      return;
    }

    if (selectedChallengerIdx !== null) {
      clearHighlight();
      return;
    }

    selectedChallengerIdx = clickedIdx;
    const availableIndexes = new Set(getChallengeOpponentIndexes(session.challengeOrder.length, clickedIdx, challengeRange));

    document.querySelectorAll('#challengeList .challenge-row').forEach((rowBtn, idx) => {
      rowBtn.classList.remove('challenge-selected', 'challenge-target', 'challenge-challenger', 'challenge-dimmed', 'challenge-row-selected', 'challenge-row-available', 'challenge-row-unavailable');
      if (idx === clickedIdx) {
        rowBtn.classList.add('challenge-selected', 'challenge-row-selected');
      } else if (availableIndexes.has(idx)) {
        rowBtn.classList.add('challenge-target', 'challenge-row-available');
      } else {
        rowBtn.classList.add('challenge-dimmed', 'challenge-row-unavailable');
      }
    });

    const hint = document.getElementById('challengeHint');
    if (hint) {
      if (availableIndexes.size) {
        const ranks = [...availableIndexes].map(idx => idx + 1).join(', ');
        hint.textContent = `${formatDisplayName(session.challengeOrder[clickedIdx])} peut jouer contre les rangs ${ranks}.`;
        hint.style.color = '#2563eb';
      } else {
        hint.textContent = `${formatDisplayName(session.challengeOrder[clickedIdx])} n'a aucun adversaire disponible dans la plage ±${challengeRange}.`;
        hint.style.color = 'var(--text-soft)';
      }
    }

    window._challengeHighlightTimeout = highlightTimeout = setTimeout(() => {
      clearHighlight();
    }, 3000);
  });
}

function renderLiveView() {
  const session = state.currentSession;
  if (!dom.liveModeLabel || !dom.liveSessionTitle || !dom.liveRotationLabel || !dom.timerStartBtn || !dom.timerPauseBtn || !dom.timerResetBtn || !dom.prevRotationBtn || !dom.nextRotationBtn) return;
  const rotationStatusBanner = document.getElementById('rotationStatusBanner');
  if (!session) {
    showView('home');
    return;
  }
  if (session.format === 'challenge') {
    toggleChallengeLiveMode(true);
    renderChallengeLive(session);
    const timerCard = document.querySelector('.timer-card');
    if (timerCard) timerCard.style.display = 'none';
    if (dom.prevRotationBtn) dom.prevRotationBtn.style.display = 'none';
    if (dom.nextRotationBtn) dom.nextRotationBtn.style.display = 'none';
    if (rotationStatusBanner) rotationStatusBanner.className = 'rotation-status-banner hidden';
    return;
  }
  toggleChallengeLiveMode(false);
  const timerCard = document.querySelector('.timer-card');
  if (timerCard) timerCard.style.display = '';
  if (dom.prevRotationBtn) dom.prevRotationBtn.style.display = '';
  if (dom.nextRotationBtn) dom.nextRotationBtn.style.display = '';
  const rotation = getCurrentRotation(session);
  dom.timerStartBtn.disabled = false;
  dom.timerPauseBtn.disabled = false;
  dom.timerResetBtn.disabled = false;
  dom.prevRotationBtn.disabled = false;
  dom.nextRotationBtn.textContent = 'Rotation suivante + reset chrono';
  dom.nextRotationBtn.onclick = null;
  dom.liveModeLabel.textContent = TOURNAMENT_MODES[session.format]?.label || session.format;
  dom.liveSessionTitle.textContent = session.name;
  dom.liveRotationLabel.textContent = rotation
    ? `${rotation.title} / ${getSessionCurrentRotationCount(session)}`
    : 'Aucune rotation';
  renderTimer();
  renderLiveMatches(session);
  if (rotationStatusBanner) {
    const complete = isRotationComplete(session);
    rotationStatusBanner.className = `rotation-status-banner ${complete ? 'complete' : 'pending'}`;
    rotationStatusBanner.textContent = complete ? 'Rotation complète' : 'Scores à compléter';
  }
  if (session.format === 'swiss') {
    dom.liveMatches.insertAdjacentHTML('afterbegin', '<div style="margin-bottom:16px;padding:12px 16px;border-radius:14px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);color:#1e3a8a;font-size:0.95rem;">🇨🇭 Ronde suisse : chaque rotation oppose des joueurs de niveau similaire. Après chaque round, les paires sont recalculées.</div>');
  }
  renderRankingDrawer(session);
}

function isRotationComplete(session, rotationIndex = session.currentRotation) {
  const rotation = getCurrentRotation(session, rotationIndex);
  if (!rotation) return false;
  return rotation.matches.every(match => isScoreComplete(getScoreRecord(session, match.id)));
}

function appendNextLadderRotation(session) {
  const currentRotation = getCurrentRotation(session);
  if (!currentRotation) return false;
  const nextNumber = session.schedule.rotations.length + 1;
  if (nextNumber > session.schedule.ladder.rotationTarget) return false;
  const allPlayers = session.schedule.teams.map(t => t.name);
  const currentSlots = [...(currentRotation.ladderSlots || [])].sort((left, right) => left.field - right.field);
  const useFixedArbitratedFields = currentSlots.some(slot => slot.hasReferee);

  const results = currentSlots.map(slot => {
    const match = currentRotation.matches.find(m => m.field === slot.field);
    const record = match ? getScoreRecord(session, match.id) : null;
    const scored = isScoreComplete(record);
    let winner = null;
    let loser = null;
    if (scored && record.home !== record.away) {
      winner = record.home > record.away ? slot.home : slot.away;
      loser = record.home > record.away ? slot.away : slot.home;
    }
    return {
      field: slot.field,
      home: slot.home,
      away: slot.away,
      referee: slot.referee || null,
      hasReferee: slot.hasReferee !== false && Boolean(slot.referee),
      winner,
      loser,
      draw: scored && record.home === record.away,
    };
  });
  let nextSlots = useFixedArbitratedFields
    ? buildNextFixedArbitratedLadderSlots(results)
    : buildNextFreeLadderSlots(results);
  if (!nextSlots) {
    console.warn(`[appendNextLadderRotation] Impossible de construire la rotation ladder ${useFixedArbitratedFields ? 'avec terrains arbitres fixes' : 'sans arbitre fixe'} de manière cohérente.`);
    return false;
  }

  const ladderMovement = validateLadderMovement({ ladderSlots: currentSlots }, nextSlots);
  if (!ladderMovement.valid) {
    console.warn(`[validateLadderMovement] rotation ladder incohérente : ${ladderMovement.violations.map(entry => `${entry.name} T${entry.from}->T${entry.to}`).join(', ')}`);
    return false;
  }

  const usedFinal = new Set(
    nextSlots.flatMap(s => [s.home, s.away, s.referee].filter(Boolean))
  );
  const newBench = allPlayers.filter(name => !usedFinal.has(name));

  let warningMessage = null;
  if (newBench.length > 0) {
    warningMessage = `⚠️ ${newBench.length} élève(s) en attente (nombre impair incompressible). Donnez-leur un rôle actif.`;
  }

  const enabledRoles = getEnabledRolesFromOptions(session.options);
  const byeAssignments = useFixedArbitratedFields
    ? assignLadderByeAssignments(newBench, session.options)
    : assignRolesForByes(newBench, enabledRoles);

  const matches = nextSlots
    .filter(slot => slot.home && slot.away)
    .map(slot => ({
      id: buildMatchKey(nextNumber, slot.home, slot.away),
      home: slot.home,
      away: slot.away,
      field: slot.field,
      phase: 'ladder',
      hasReferee: slot.hasReferee,
      ...(slot.referee ? { ladderReferee: slot.referee } : {}),
    }));

  const newOrder = [
    ...nextSlots.flatMap(s => [s.home, s.away, s.referee].filter(Boolean)),
    ...newBench,
  ];

  const nextRotation = {
    number: nextNumber,
    title: `Rotation ${nextNumber}`,
    phase: 'ladder',
    matches,
    byes: newBench,
    byeAssignments,
    orderSnapshot: newOrder,
    ladderSlots: nextSlots,
    warningMessage,
  };

  session.schedule.ladder.currentSlots = nextSlots;
  session.schedule.ladder.latestOrder = newOrder;
  session.schedule.rotations.push(nextRotation);
  syncDynamicRotationCount(session.schedule);
  session.schedule.meta.matchCount += matches.length;
  ensureStableMatchIds(session.schedule);
  validateUniqueMatchIds(session.schedule);
  validateTournamentSchedule(session.schedule, { ...session.options, scores: session.scores });
  return true;
}

function appendNextSwissRotation(session) {
  const swiss = session.schedule.swiss;
  const currentRotation = getCurrentRotation(session);
  if (!swiss || !currentRotation || swiss.round >= swiss.maxRounds) return false;
  const committedMatches = swiss.currentMatches.map(match => ({ ...match }));
  committedMatches.forEach(match => {
    if (match.bye) {
      const player = swiss.players.find(entry => entry.id === match.p1Id);
      if (player) {
        player.points += 1;
        player.bye += 1;
      }
      return;
    }
    const record = getScoreRecord(session, match.id);
    if (!isScoreComplete(record)) return;
    const p1 = swiss.players.find(entry => entry.id === match.p1Id);
    const p2 = swiss.players.find(entry => entry.id === match.p2Id);
    if (!p1 || !p2) return;
    p1.matches += 1;
    p2.matches += 1;
    p1.opponents.push(p2.id);
    p2.opponents.push(p1.id);
    if (record.home > record.away) {
      p1.wins += 1;
      p1.points += 3;
      p2.losses += 1;
    } else if (record.home < record.away) {
      p2.wins += 1;
      p2.points += 3;
      p1.losses += 1;
    } else {
      // Match nul — 1 point chacun, cohérent avec computeTeamStandings
      p1.draws += 1;
      p1.points += 1;
      p2.draws += 1;
      p2.points += 1;
    }
  });
  swiss.history.push({ round: swiss.round, matches: committedMatches });
  swiss.round += 1;
  const previousMatches = swiss.history.flatMap(round => round.matches);
  swiss.currentMatches = generateSwissPairings(swiss.players, previousMatches).map((match, index) => ({
    ...match,
    id: match.bye ? `swiss-bye-${swiss.round}-${match.p1Id}` : `swiss-${swiss.round}-${index + 1}`,
  }));
  const playerMap = new Map(swiss.players.map(player => [player.id, player]));
  const newRotations = splitRotationIntoWaves(buildSwissRotation(swiss.round, swiss.currentMatches, playerMap, session.options), session.options.fields, getEnabledRolesFromOptions(session.options));
  validateRotationCapacity(newRotations, session.options.fields, 'swiss');
  newRotations.forEach(rotation => validateRotationRoles(rotation, 'swiss'));
  session.schedule.rotations.push(...newRotations);
  syncDynamicRotationCount(session.schedule);
  session.schedule.meta.matchCount += swiss.currentMatches.filter(match => !match.bye).length;
  ensureStableMatchIds(session.schedule);
  validateUniqueMatchIds(session.schedule);
  validateTournamentSchedule(session.schedule, { ...session.options, scores: session.scores });
  return true;
}

function moveToNextRotation() {
  const session = state.currentSession;
  if (!session) return;
  if (!isRotationComplete(session)) {
    window.alert('Terminez tous les matchs de la rotation avant de passer à la suivante. Utilisez aussi "Valider 0-0" si un match nul sans point doit compter.');
    return;
  }
  const atLastRotation = session.currentRotation >= session.schedule.rotations.length - 1;
  if (session.format === 'ladder' && atLastRotation) {
    const appended = appendNextLadderRotation(session);
    if (!appended) {
      if (!window.confirm('Nombre maximum de rotations atteint. Terminer le tournoi et voir les statistiques ?')) return;
      session.completed = true;
      saveSessionLocally(session);
      showView('summary');
      return;
    }
  }
  if (session.format === 'swiss' && atLastRotation) {
    const appended = appendNextSwissRotation(session);
    if (!appended) {
      if (!window.confirm('Nombre maximum de rondes atteint. Terminer le tournoi et voir les statistiques ?')) return;
      session.completed = true;
      saveSessionLocally(session);
      showView('summary');
      return;
    }
  }
  if (session.currentRotation < session.schedule.rotations.length - 1) {
    session.currentRotation += 1;
    resetTimer();
    saveSessionLocally(session);
    renderLiveView();
    return;
  }
  session.completed = true;
  saveSessionLocally(session);
  showView('summary');
}

function moveToPreviousRotation() {
  const session = state.currentSession;
  if (!session || session.currentRotation <= 0) return;
  session.currentRotation -= 1;
  resetTimer();
  saveSessionLocally(session);
  renderLiveView();
}

/* === Vue 5 — statistiques et export === */

function renderStandingsTable(session, standings) {
  const isTeamMode = session.sport === 'sport-co' && session.format !== 'rotating-teams';
  return `
    <div class="summary-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rang</th>
            <th>${isTeamMode ? 'Équipe' : 'Joueur'}</th>
            <th><span class="th-tip" title="Victoires">V</span></th>
            <th><span class="th-tip" title="Matchs nuls">N</span></th>
            <th><span class="th-tip" title="Défaites">D</span></th>
            <th><span class="th-tip" title="Points : 3 par victoire, 1 par nul, 0 par défaite">Pts</span></th>
            <th><span class="th-tip" title="${isTeamMode ? 'Buts marqués / Buts encaissés' : 'Points marqués / encaissés'}">±</span></th>
            <th><span class="th-tip" title="Ratio : Victoires ÷ Matchs joués (1.00 = toutes victoires)">Ratio</span></th>
          </tr>
        </thead>
        <tbody>
          ${standings.map((row, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(isTeamMode ? row.name : formatDisplayName(row.name))}</td>
              <td>${row.wins}</td>
              <td>${row.draws}</td>
              <td>${row.losses}</td>
              <td>${row.points}</td>
              <td>${row.pointsFor} / ${row.pointsAgainst}</td>
              <td>${row.played ? (row.wins / row.played).toFixed(2) : '0.00'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderSummaryStats(session, standings) {
  const isTeamMode = session.sport === 'sport-co' && session.format !== 'rotating-teams';
  return standings.map(row => `
    <article class="stat-row">
      <strong>${escapeHtml(isTeamMode ? row.name : formatDisplayName(row.name))}</strong>
      <span>${row.wins}V ${row.draws}N ${row.losses}D · ${row.points} pts · ${row.pointsFor}/${row.pointsAgainst}</span>
      ${isTeamMode ? `<span>Différence : ${row.goalDiff}</span>` : `<span>Ratio : ${(row.ratio || 0).toFixed(2)}</span>`}
      ${session.format === 'challenge' && row.challengesMade !== undefined
        ? `<span style="font-size:0.88rem;color:var(--text-soft);">Défis lancés : ${row.challengesMade} · Défis reçus : ${row.challengesReceived}</span>`
        : ''}
      ${row.badges?.length ? `<div class="badges">${row.badges.map(badge => `<span class="badge">${escapeHtml(badge)}</span>`).join('')}</div>` : ''}
    </article>
  `).join('');
}

function renderSummaryView() {
  const session = state.currentSession || getSessionById(state.lastStatsSessionId);
  if (!session) {
    showView('home');
    return;
  }
  const standings = computeStandings(session);
  state.currentSession = session;
  dom.summaryTitle.textContent = session.name;
  dom.summarySubtitle.textContent = `${session.sport === 'raquette' ? 'Raquettes' : 'Sports collectifs'} · ${TOURNAMENT_MODES[session.format]?.label || session.format}`;
  dom.summaryContent.innerHTML = `
    <section class="summary-card">
      <div class="panel-head">
        <h3>Classement final</h3>
      </div>
      ${standings.length ? renderStandingsTable(session, standings) : '<div class="empty-state">Aucun résultat enregistré.</div>'}
    </section>
    <section class="summary-card">
      <div class="panel-head">
        <h3>${session.sport === 'sport-co' && session.format !== 'rotating-teams' ? 'Statistiques par équipe' : 'Statistiques par joueur'}</h3>
      </div>
      <div class="stat-list">
        ${standings.length ? renderSummaryStats(session, standings) : ''}
      </div>
    </section>
  `;
}

function exportCsv(session = state.currentSession) {
  if (!session) return;
  let standings = computeStandings(session);
  if (session.format === 'rotating-teams') {
    standings = computeRotatingPlayerStats(session);
  }
  const formatCsvName = value => (session.sport === 'raquette' ? formatDisplayName(value) : value);
  const rankingHeader = 'nom;victoires;nuls;defaites;points;buts_pour;buts_contre';
  const rankingRows = standings.map(row => [formatCsvName(row.name), row.wins, row.draws, row.losses, row.points, row.pointsFor, row.pointsAgainst].join(';'));
  let matchHeader = 'rotation;terrain;domicile;exterieur;score_domicile;score_exterieur';
  let matchRows = session.schedule.rotations.flatMap(rotation =>
    rotation.matches.map(match => {
      const participants = resolveMatchParticipants(match, session);
      const record = getScoreRecord(session, match.id);
      if (!isScoreComplete(record)) return null;
      return [rotation.number, match.field || '', formatCsvName(participants.home), formatCsvName(participants.away), record.home ?? '', record.away ?? ''].join(';');
    }).filter(Boolean)
  );
  if (session.format === 'ladder') {
    matchHeader = 'rotation;terrain;domicile;exterieur;resultat';
    matchRows = session.schedule.rotations.flatMap(rotation =>
      rotation.matches.map(match => {
        const participants = resolveMatchParticipants(match, session);
        const record = getScoreRecord(session, match.id);
        if (!isScoreComplete(record)) return null;
        const winner = record.home > record.away ? participants.home : record.away > record.home ? participants.away : '';
        const resultLabel = winner
          ? `Victoire ${formatCsvName(winner)}`
          : 'Match nul';
        return [rotation.number, match.field || '', formatCsvName(participants.home), formatCsvName(participants.away), resultLabel].join(';');
      }).filter(Boolean)
    );
  }
  if (session.format === 'challenge') {
    matchHeader = 'ordre;nom;victoires;defaites;points_marques;points_encaisses';
    matchRows = standings.map((row, index) => [index + 1, formatCsvName(row.name), row.wins, row.losses, row.pointsFor, row.pointsAgainst].join(';'));
  }
  const csv = [
    'Classement général',
    rankingHeader,
    ...rankingRows,
    '',
    'Détail des matchs',
    matchHeader,
    ...matchRows,
  ].join('\n');
  triggerDownload(csv, `${slugify(session.name || 'eps-tournoi')}.csv`, 'text/csv;charset=utf-8;');
}

function triggerDownload(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function slugify(value) {
  return String(value || 'eps-tournoi')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* === Vue 3 — sauvegardes et reprise === */

function renderSessionsView() {
  const sessions = loadStoredSessions().sort((left, right) => new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime());
  if (!sessions.length) {
    dom.sessionsList.innerHTML = '<div class="empty-state">Aucune séance enregistrée pour le moment.</div>';
    return;
  }
  dom.sessionsList.innerHTML = sessions.map(session => `
    <article class="session-item">
      <div class="session-item-header">
        <strong>${escapeHtml(session.name || 'Séance')}</strong>
        <span class="session-item-meta">${escapeHtml(TOURNAMENT_MODES[session.format]?.label || session.format)} · ${new Date(session.savedAt).toLocaleDateString('fr-FR')}</span>
      </div>
      <div class="session-item-actions">
        <button class="btn btn-primary btn-sm" type="button" data-session-action="resume" data-session-id="${session.id}">Reprendre</button>
        <button class="btn btn-secondary btn-sm" type="button" data-session-action="stats" data-session-id="${session.id}">Stats</button>
        <button class="btn btn-secondary btn-sm" type="button" data-session-action="delete" data-session-id="${session.id}">Supprimer</button>
      </div>
    </article>
  `).join('');
}

function openClassroomModal(config = {}) {
  return new Promise(resolve => {
    const classrooms = loadClassrooms();
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px;';
    overlay.innerHTML = `
      <div style="background:var(--surface);border-radius:var(--radius-xl);box-shadow:var(--shadow);width:min(100%,640px);padding:28px 24px;display:grid;gap:16px;max-height:90vh;overflow:auto;">
        <div>
          <p style="margin:0 0 8px;font-size:0.88rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--accent-dark);">${escapeHtml(config.kicker || 'Suivi élèves')}</p>
          <h3 style="margin:0 0 8px;">${escapeHtml(config.title || 'Associer à une classe ?')}</h3>
          <p style="margin:0;color:var(--text-soft);">${escapeHtml(config.subtitle || 'Permet un suivi élève sur plusieurs séances. Facultatif.')}</p>
        </div>
        ${classrooms.length ? `<div style="display:grid;gap:10px;">${classrooms.map(classroom => `<button class="choice-card" type="button" data-classroom-pick="${classroom.id}" style="justify-content:space-between;text-align:left;"><span>${escapeHtml(classroom.name)}</span><span style="color:var(--text-soft);font-size:0.9rem;">${classroom.sessionIds?.length || 0} séance${(classroom.sessionIds?.length || 0) > 1 ? 's' : ''}</span></button>`).join('')}</div>` : ''}
        <div style="display:grid;gap:12px;">
          <button class="btn btn-primary btn-lg" type="button" id="classroomCreateToggleBtn">➕ Nouvelle classe</button>
          ${config.allowIgnore !== false ? '<button class="btn btn-secondary btn-lg" type="button" id="classroomIgnoreBtn">Ignorer</button>' : ''}
        </div>
        <div id="classroomCreateForm" style="display:none;gap:12px;">
          <label class="field">
            <span>Nom de la classe</span>
            <input id="classroomNameInputModal" type="text" placeholder="4B" />
          </label>
          <button class="btn btn-primary btn-lg" type="button" id="classroomCreateConfirmBtn">Créer et associer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cleanup = value => {
      document.body.removeChild(overlay);
      resolve(value);
    };

    overlay.addEventListener('click', event => {
      if (event.target === overlay && config.allowIgnore !== false) {
        cleanup(null);
      }
    });

    overlay.querySelectorAll('[data-classroom-pick]').forEach(button => {
      button.addEventListener('click', () => cleanup(button.dataset.classroomPick));
    });

    const createForm = overlay.querySelector('#classroomCreateForm');
    const createToggle = overlay.querySelector('#classroomCreateToggleBtn');
    if (createToggle) {
      createToggle.addEventListener('click', () => {
        createForm.style.display = createForm.style.display === 'none' ? 'grid' : 'none';
      });
    }

    const ignoreBtn = overlay.querySelector('#classroomIgnoreBtn');
    if (ignoreBtn) {
      ignoreBtn.addEventListener('click', () => cleanup(null));
    }

    const createConfirm = overlay.querySelector('#classroomCreateConfirmBtn');
    if (createConfirm) {
      createConfirm.addEventListener('click', () => {
        const input = overlay.querySelector('#classroomNameInputModal');
        const name = String(input?.value || '').trim();
        if (!name) return;
        const classroom = {
          id: uniqueId('class'),
          name,
          colorIndex: loadClassrooms().length % 8,
          sport: config.sport || state.draft.sport || 'raquette',
          createdAt: new Date().toISOString(),
          sessionIds: [],
          students: [],
        };
        upsertClassroom(classroom);
        cleanup(classroom.id);
      });
    }
  });
}

function promptClassroomChoice() {
  return openClassroomModal({
    title: 'Associer à une classe ?',
    subtitle: 'Permet un suivi élève sur plusieurs séances. Facultatif.',
    kicker: 'Suivi élèves',
    allowIgnore: true,
    sport: state.draft.sport,
  });
}

async function promptCreateClassroom() {
  const classroomId = await openClassroomModal({
    title: 'Créer une classe',
    subtitle: 'Ajoutez une classe pour suivre plusieurs séances.',
    kicker: 'Mes classes',
    allowIgnore: false,
    sport: state.draft.sport,
  });
  if (classroomId) {
    renderClassroomsView();
  }
}

function renderClassroomsView() {
  const classrooms = loadClassrooms();
  if (!classrooms.length) {
    dom.classroomsList.innerHTML = '<div class="empty-state">Aucune classe créée.<br>Cliquez sur « Nouvelle classe » pour commencer.</div>';
    return;
  }
  dom.classroomsList.innerHTML = classrooms.map((classroom, index) => {
    const colorClass = `classroom-color-${(classroom.colorIndex ?? index) % 8}`;
    const sportLabel = classroom.sport === 'raquette' ? '🏸 Raquettes' : '⚽ Sport collectif';
    const sessionCount = classroom.sessionIds?.length || 0;
    const studentCount = classroom.students?.length || 0;
    return `
      <article class="classroom-card ${colorClass}">
        <div>
          <span class="classroom-sport-badge">${sportLabel}</span>
          <h3>${escapeHtml(classroom.name)}</h3>
          <p class="classroom-meta">${sessionCount} séance${sessionCount > 1 ? 's' : ''} · ${studentCount} élève${studentCount > 1 ? 's' : ''}</p>
        </div>
        <div class="classroom-actions">
          <button class="btn btn-primary btn-sm" type="button" data-classroom-view="${classroom.id}">📂 Ouvrir la classe</button>
          <button class="btn btn-secondary btn-sm" type="button" data-classroom-delete="${classroom.id}">🗑️ Supprimer</button>
        </div>
      </article>
    `;
  }).join('');
  dom.classroomsList.querySelectorAll('[data-classroom-view]').forEach(button => {
    button.addEventListener('click', () => showClassroomDetail(button.dataset.classroomView));
  });
  dom.classroomsList.querySelectorAll('[data-classroom-delete]').forEach(button => {
    button.addEventListener('click', () => {
      if (window.confirm('Supprimer définitivement cette classe et tout son historique ?')) {
        deleteClassroom(button.dataset.classroomDelete);
        renderClassroomsView();
      }
    });
  });
}

function showClassroomDetail(classroomId) {
  const classroom = getClassroomById(classroomId);
  if (!classroom) return;
  const allSessions = loadStoredSessions();
  const sessions = allSessions
    .filter(session => classroom.sessionIds?.includes(session.id))
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());

  const sportCoSessions = sessions.filter(s => s.sport !== 'raquette');
  const raquetteSessions = sessions.filter(s => s.sport === 'raquette');

  const students = [...(classroom.students || [])].sort((left, right) => {
    const leftRatio = left.totalPlayed ? left.totalWins / left.totalPlayed : 0;
    const rightRatio = right.totalPlayed ? right.totalWins / right.totalPlayed : 0;
    if (rightRatio !== leftRatio) return rightRatio - leftRatio;
    return left.name.localeCompare(right.name, 'fr');
  });

  const colorClass = `classroom-color-${(classroom.colorIndex ?? 0) % 8}`;

  dom.classroomDetailTitle.textContent = classroom.name;
  dom.classroomDetailMeta.textContent = `${sessions.length} séances · ${students.length} élèves`;

  function renderSessionList(list) {
    if (!list.length) return '<p style="color:var(--text-soft);padding:12px 0;">Aucune séance.</p>';
    return list.map(session => {
      const isCompleted = session.completed === true;
      const statusBadge = isCompleted
        ? '<span class="session-status-badge completed">✅ Terminé</span>'
        : '<span class="session-status-badge ongoing">🔄 En cours</span>';
      const date = new Date(session.savedAt).toLocaleDateString('fr-FR');
      const formatLabel = escapeHtml(TOURNAMENT_MODES[session.format]?.label || session.format);
      return `
        <article class="session-item" style="margin-bottom:10px;">
          <div class="session-item-header">
            <strong>${escapeHtml(session.name || 'Séance sans nom')}</strong>
            <span class="session-item-meta">${date} · ${formatLabel} ${statusBadge}</span>
          </div>
          <div class="session-item-actions">
            <button class="btn btn-secondary btn-sm" type="button"
              data-session-action="stats" data-session-id="${session.id}">
              📊 Stats
            </button>
            ${!isCompleted ? `<button class="btn btn-primary btn-sm" type="button"
              data-session-action="resume" data-session-id="${session.id}">
              ▶ Reprendre
            </button>` : ''}
            <button class="btn btn-secondary btn-sm" type="button"
              data-classroom-remove-session="${session.id}" data-classroom-id="${classroomId}"
              style="color:#991b1b;">
              🗑️ Retirer
            </button>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderStatTable(list, isSportCo) {
    const studentsForSport = students.filter(s =>
      isSportCo
        ? list.some(sess => sess.id && classroom.sessionIds?.includes(sess.id))
        : true
    );
    if (!studentsForSport.length) return '<p style="color:var(--text-soft);">Aucune donnée.</p>';
    if (isSportCo) {
      return `
        <div class="summary-table-wrap">
          <table>
            <thead><tr>
              <th>Équipe / Élève</th><th>Séances</th>
              <th>J</th><th>V</th><th>N</th><th>D</th>
              <th>BP</th><th>BC</th><th>Ratio V/J</th>
            </tr></thead>
            <tbody>
              ${studentsForSport.map(s => `<tr>
                <td>${escapeHtml(formatDisplayName(s.name))}</td>
                <td>${s.sessionsCount}</td>
                <td>${s.totalPlayed}</td>
                <td>${s.totalWins}</td>
                <td>${s.totalDraws}</td>
                <td>${s.totalLosses}</td>
                <td>${s.totalPointsFor}</td>
                <td>${s.totalPointsAgainst}</td>
                <td>${s.totalPlayed ? (s.totalWins / s.totalPlayed).toFixed(2) : '0.00'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } else {
      return `
        <div class="summary-table-wrap">
          <table>
            <thead><tr>
              <th>Joueur</th><th>Séances</th>
              <th>Matchs</th><th>V</th><th>D</th>
              <th>Ratio V/J</th><th>Meilleur rang</th>
            </tr></thead>
            <tbody>
              ${studentsForSport.map(s => `<tr>
                <td>${escapeHtml(formatDisplayName(s.name))}</td>
                <td>${s.sessionsCount}</td>
                <td>${s.totalPlayed}</td>
                <td>${s.totalWins}</td>
                <td>${s.totalLosses}</td>
                <td>${s.totalPlayed ? (s.totalWins / s.totalPlayed).toFixed(2) : '0.00'}</td>
                <td>${s.bestRank ?? '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }
  }

  dom.classroomDetailContent.innerHTML = `
    <div class="${colorClass}" style="margin-bottom:20px;">

      ${sportCoSessions.length ? `
      <section class="summary-card" style="margin-bottom:20px;">
        <div class="panel-head">
          <h3>⚽ Séances Sport collectif</h3>
        </div>
        ${renderSessionList(sportCoSessions)}
        <details style="margin-top:12px;">
          <summary style="cursor:pointer;font-weight:700;color:var(--text-soft);">📊 Stats cumulées Sport collectif</summary>
          <div style="margin-top:12px;">${renderStatTable(sportCoSessions, true)}</div>
        </details>
      </section>` : ''}

      ${raquetteSessions.length ? `
      <section class="summary-card" style="margin-bottom:20px;">
        <div class="panel-head">
          <h3>🏸 Séances Raquettes</h3>
        </div>
        ${renderSessionList(raquetteSessions)}
        <details style="margin-top:12px;">
          <summary style="cursor:pointer;font-weight:700;color:var(--text-soft);">📊 Stats cumulées Raquettes</summary>
          <div style="margin-top:12px;">${renderStatTable(raquetteSessions, false)}</div>
        </details>
      </section>` : ''}

      ${!sportCoSessions.length && !raquetteSessions.length ? `
      <div class="empty-state">Aucune séance associée à cette classe pour l'instant.<br>
      Lancez un tournoi et associez-le à cette classe en fin de séance.</div>` : ''}

    </div>
  `;
  dom.classroomDetailContent.querySelectorAll('[data-session-action]').forEach(button => {
    button.addEventListener('click', () => {
      const { sessionId, sessionAction: action } = button.dataset;
      if (action === 'resume') restoreSession(sessionId, 'live');
      if (action === 'stats') restoreSession(sessionId, 'summary');
    });
  });

  dom.classroomDetailContent.querySelectorAll('[data-classroom-remove-session]').forEach(button => {
    button.addEventListener('click', () => {
      if (!window.confirm('Retirer cette séance de la classe ? (La séance reste dans vos sauvegardes)')) return;
      const cl = getClassroomById(button.dataset.classroomId);
      if (!cl) return;
      cl.sessionIds = (cl.sessionIds || []).filter(id => id !== button.getAttribute('data-classroom-remove-session'));
      upsertClassroom(cl);
      showClassroomDetail(classroomId);
    });
  });

  showView('classroom-detail');
}

function restoreSession(sessionId, targetView = 'live') {
  const snapshot = getSessionById(sessionId);
  if (!snapshot) return;
  state.currentSession = cloneData(snapshot);
  if (!state.currentSession?.schedule || !Array.isArray(state.currentSession.schedule.rotations)) {
    console.error(`[restoreSession] Séance ${sessionId} invalide : planning absent ou corrompu.`);
    return;
  }
  syncDynamicRotationCount(state.currentSession.schedule);
  ensureStableMatchIds(state.currentSession.schedule);
  validateUniqueMatchIds(state.currentSession.schedule);
  const maxRotationIndex = Math.max(0, (state.currentSession.schedule.rotations?.length || 1) - 1);
  const restoredRotation = Number(state.currentSession.currentRotation);
  state.currentSession.currentRotation = Number.isInteger(restoredRotation)
    ? Math.min(Math.max(restoredRotation, 0), maxRotationIndex)
    : 0;
  if (restoredRotation !== state.currentSession.currentRotation) {
    console.warn(`[restoreSession] currentRotation incohérent pour ${sessionId}, valeur corrigée à ${state.currentSession.currentRotation}.`);
  }
  const knownMatchIds = new Set(state.currentSession.schedule.rotations.flatMap(rotation => (rotation.matches || []).map(match => match.id).filter(Boolean)));
  Object.keys(state.currentSession.scores || {}).forEach(matchId => {
    if (!knownMatchIds.has(matchId)) {
      console.warn(`[restoreSession] Score restauré sans match correspondant : ${matchId}.`);
    }
  });
  validateTournamentSchedule(state.currentSession.schedule, { ...(state.currentSession.options || {}), scores: state.currentSession.scores });
  if (state.currentSession.format === 'challenge') {
    if (!state.currentSession.challengeOrder) {
      state.currentSession.challengeOrder = state.currentSession.schedule.teams.map(t => t.name);
    }
    if (!state.currentSession.challengeLog) {
      state.currentSession.challengeLog = [];
    }
  }
  state.lastStatsSessionId = snapshot.id;
  clearInterval(runtime.timerInterval);
  runtime.timerInterval = null;
  if (snapshot.timer && typeof snapshot.timer === 'object') {
    const fallbackSeconds = (state.currentSession?.options?.duration || 7) * 60;
    const totalSeconds = Math.max(1, Number(snapshot.timer.totalSeconds) || fallbackSeconds);
    const remainingSeconds = Math.min(totalSeconds, Math.max(0, Number(snapshot.timer.remainingSeconds)));
    state.timer.totalSeconds = totalSeconds;
    state.timer.remainingSeconds = Number.isFinite(remainingSeconds) ? remainingSeconds : totalSeconds;
    state.timer.running = false;
    renderTimer();
    persistState();
  } else {
    resetTimer();
  }
  if (targetView === 'summary' || snapshot.completed) {
    showView('summary');
  } else {
    showView('live');
  }
}

/* === Vue 1 — accueil === */

function renderHomeView() {
  const sessions = loadStoredSessions().sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  const classrooms = loadClassrooms();
  const latest = sessions[0] || null;

  const hasOngoing = sessions.some(s => !s.completed);
  if (dom.resumeSessionBtn) dom.resumeSessionBtn.disabled = !hasOngoing;

  if (dom.lastStatsBtn) {
    if (latest) {
      dom.lastStatsBtn.classList.remove('hidden');
      const sportIcon = latest.sport === 'raquette' ? '🏸' : '⚽';
      dom.lastStatsBtn.textContent = `${sportIcon} Dernière séance : ${escapeHtml(latest.name || 'Stats')}`;
    } else {
      dom.lastStatsBtn.classList.add('hidden');
    }
  }
}

/* === Événements === */

function handleGlobalClick(event) {
  const viewTarget = event.target.closest('[data-view-target]');
  if (viewTarget) {
    showView(viewTarget.dataset.viewTarget);
    return;
  }

  const sportButton = event.target.closest('[data-sport]');
  if (sportButton) {
    state.draft.sport = sportButton.dataset.sport === 'raquette' ? 'raquette' : 'sport-co';
    state.draft.format = FORMAT_DEFINITIONS[state.draft.sport][0].id;
    state.draft.selectedConfigKey = '';
    hideSimulationPanel();
    renderNewTournamentView();
    persistState();
    return;
  }

  const formatButton = event.target.closest('[data-format]');
  if (formatButton) {
    state.draft.format = formatButton.dataset.format;
    state.draft.selectedConfigKey = '';
    hideSimulationPanel();
    renderNewTournamentView();
    persistState();
    return;
  }

  const configButton = event.target.closest('[data-config-key]');
  if (configButton) {
    state.draft.selectedConfigKey = configButton.dataset.configKey;
    hideSimulationPanel();
    renderNewTournamentView();
    persistState();
    return;
  }

  const analysisConfigButton = event.target.closest('[data-analysis-config-key]');
  if (analysisConfigButton) {
    state.draft.selectedConfigKey = analysisConfigButton.dataset.analysisConfigKey;
    state.draft.newStep = 4;
    hideSimulationPanel();
    renderNewTournamentView();
    persistState();
    return;
  }

  const helpTabButton = event.target.closest('[data-help-tab]');
  if (helpTabButton) {
    renderHelpTabs(helpTabButton.dataset.helpTab || 'start');
    return;
  }

  const teamScoreButton = event.target.closest('[data-score-step]');
  if (teamScoreButton) {
    adjustScore(teamScoreButton.dataset.matchId, teamScoreButton.dataset.scoreSide, Number(teamScoreButton.dataset.scoreStep));
    return;
  }

  const zeroScoreButton = event.target.closest('[data-score-zero]');
  if (zeroScoreButton) {
    validateZeroScore(zeroScoreButton.dataset.scoreZero);
    return;
  }

  const rotatingOutcomeButton = event.target.closest('[data-rotating-outcome]');
  if (rotatingOutcomeButton) {
    setRotatingOutcome(rotatingOutcomeButton.dataset.matchId, rotatingOutcomeButton.dataset.rotatingOutcome);
    return;
  }

  const ladderOutcomeButton = event.target.closest('[data-ladder-result]');
  if (ladderOutcomeButton) {
    setLadderOutcome(ladderOutcomeButton.dataset.matchId, ladderOutcomeButton.dataset.ladderResult);
    return;
  }

  const ladderClearButton = event.target.closest('[data-ladder-clear]');
  if (ladderClearButton) {
    clearLadderOutcome(ladderClearButton.dataset.ladderClear);
    return;
  }

  const sessionAction = event.target.closest('[data-session-action]');
  if (sessionAction) {
    const { sessionId, sessionAction: action } = sessionAction.dataset;
    if (action === 'resume') restoreSession(sessionId, 'live');
    if (action === 'stats') restoreSession(sessionId, 'summary');
    if (action === 'delete') {
      if (window.confirm('Supprimer cette séance sauvegardée ?')) {
        deleteStoredSession(sessionId);
        renderSessionsView();
        renderHomeView();
      }
    }
    return;
  }

  if (event.target === dom.startNewTournamentBtn) {
    state.draft.newStep = 1;
    showView('new');
    return;
  }
  if (event.target === dom.helpBtn) {
    renderHelpTabs('start');
    dom.helpModal?.classList.remove('hidden');
    return;
  }
  if (event.target === dom.closeHelpBtn || event.target === dom.helpLaunchBtn) {
    dom.helpModal?.classList.add('hidden');
    if (event.target === dom.helpLaunchBtn) showView('new');
    return;
  }
  if (event.target === dom.resumeSessionBtn) {
    showView('sessions');
    return;
  }
  if (event.target === dom.lastStatsBtn) {
    const latest = loadStoredSessions().sort((left, right) => new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime())[0];
    if (latest) restoreSession(latest.id, 'summary');
    return;
  }
  if (event.target === dom.simulateSessionBtn) {
    simulateCurrentDraft();
    return;
  }
  if (event.target === dom.analysisModifyBtn) {
    state.draft.newStep = 2;
    renderNewTournamentView();
    persistState();
    return;
  }
  if (event.target === dom.skipNamesStepBtn) {
    state.draft.newStep = 5;
    renderNewTournamentView();
    persistState();
    return;
  }
  if (event.target === dom.ladderAlphaBtn) {
    applyDraftLadderPlacementMode('alpha');
    renderNewTournamentView();
    persistState();
    return;
  }
  if (event.target === dom.ladderRandomBtn) {
    applyDraftLadderPlacementMode('random');
    renderNewTournamentView();
    persistState();
    return;
  }
  if (event.target === dom.ladderManualBtn) {
    applyDraftLadderPlacementMode('manual');
    renderNewTournamentView();
    persistState();
    return;
  }
  if (event.target === dom.newStepPrevBtn) {
    state.draft.newStep = clampDraftStep(state.draft.newStep - 1);
    renderNewTournamentView();
    persistState();
    return;
  }
  if (event.target === dom.newStepNextBtn) {
    state.draft.newStep = clampDraftStep(state.draft.newStep + 1);
    renderNewTournamentView();
    persistState();
    return;
  }
  if (event.target === dom.timerStartBtn) {
    startTimer();
    return;
  }
  if (event.target === dom.timerPauseBtn) {
    pauseTimer();
    return;
  }
  if (event.target === dom.timerResetBtn) {
    resetTimer();
    return;
  }
  if (event.target === dom.prevRotationBtn) {
    moveToPreviousRotation();
    return;
  }
  if (event.target === dom.nextRotationBtn) {
    if (state.currentSession?.format === 'challenge') return;
    moveToNextRotation();
    return;
  }
  if (event.target === dom.saveSessionBtn || event.target === dom.saveSummaryBtn) {
    if (state.currentSession) {
      saveSessionLocally(state.currentSession);
      window.alert('Séance sauvegardée.');
    }
    return;
  }
  if (event.target === dom.printSummaryBtn) {
    window.print();
    return;
  }
  if (event.target === dom.exportCsvBtn) {
    exportCsv(state.currentSession);
    return;
  }
  if (event.target === dom.exportAllSessionsBtn) {
    triggerDownload(JSON.stringify(loadStoredSessions(), null, 2), `eps-tournoi-sessions-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    return;
  }
  if (event.target === dom.openRankingBtn) {
    if (state.currentSession) renderRankingDrawer(state.currentSession);
    dom.rankingDrawer.classList.remove('hidden');
    return;
  }
  if (event.target === dom.closeRankingBtn) {
    dom.rankingDrawer.classList.add('hidden');
  }
}

function handleGlobalInput(event) {
  if (dom.newTournamentForm?.contains(event.target)) {
    hideSimulationPanel();
  }
  if (event.target === dom.participantCountInput) {
    state.draft.participantCount = clampSetupCount(event.target.value, 24);
    renderNewTournamentView();
    persistState();
    return;
  }
  if (event.target === dom.fieldCountInput) {
    state.draft.fields = clampNumber(Number(event.target.value) || 2, 1, 20, 2);
    renderNewTournamentView();
    persistState();
    return;
  }
  if (event.target === dom.startTimeInput) {
    state.draft.startTime = event.target.value || '10:00';
    renderTimeSection();
    renderNewTournamentSummary();
    persistState();
    return;
  }
  if (event.target === dom.endTimeInput) {
    state.draft.endTime = event.target.value || '11:00';
    renderTimeSection();
    renderNewTournamentSummary();
    persistState();
    return;
  }
  if (event.target === dom.matchDurationInput) {
    state.draft.duration = clampNumber(Number(event.target.value) || 7, 1, 60, 7);
    renderTimeSection();
    renderNewTournamentSummary();
    persistState();
    return;
  }
  if (event.target === dom.sessionNameInput) {
    state.draft.sessionName = event.target.value;
    persistState();
    return;
  }
  if (event.target === dom.studentNamesInput) {
    state.draft.studentNamesText = event.target.value;
    renderLadderSetupSection();
    renderChallengeSetupSection();
    persistState();
    return;
  }
  if (event.target.matches('[data-ladder-arb-field]')) {
    const field = Number(event.target.dataset.ladderArbField);
    const current = new Set(normalizeLadderArbitratedFieldsForSource(state.draft));
    if (event.target.checked) current.add(field);
    else current.delete(field);
    state.draft.ladderArbitratedFields = [...current].sort((left, right) => left - right);
    persistDraftLadderSlots(getDraftLadderInitialSlotsForSource(state.draft));
    renderNewTournamentView();
    persistState();
    return;
  }
  if (event.target.matches('[data-ladder-slot-field][data-ladder-slot-role]')) {
    const field = Number(event.target.dataset.ladderSlotField);
    const role = event.target.dataset.ladderSlotRole;
    setDraftLadderSlotValue(field, role, event.target.value);
    renderLadderSetupSection();
    renderNewTournamentSummary();
    persistState();
    return;
  }
  if (event.target.matches('[data-challenge-rank]')) {
    const rank = Number(event.target.dataset.challengeRank);
    setDraftChallengeRankValue(rank, event.target.value);
    renderChallengeSetupSection();
    renderNewTournamentSummary();
    persistState();
    return;
  }
  if (event.target === dom.rotatingRefereeInput) {
    state.draft.rotatingReferee = dom.rotatingRefereeInput.checked;
    persistState();
    return;
  }
  if (event.target === dom.scoreTableInput) {
    state.draft.scoreTable = dom.scoreTableInput.checked;
    persistState();
    return;
  }
  if (event.target === dom.challengeRangeInput) {
    state.draft.challengeRange = clampNumber(Number(event.target.value) || 5, 1, 10, 5);
    if (dom.challengeRangeLabel) dom.challengeRangeLabel.textContent = `±${state.draft.challengeRange}`;
    persistState();
    return;
  }
  if (event.target === dom.poolSizeInput) {
    state.draft.poolSize = clampNumber(Number(event.target.value) || 4, 3, 6, 4);
    if (dom.poolSizeLabel) dom.poolSizeLabel.textContent = `${state.draft.poolSize}`;
    persistState();
    return;
  }
  if (event.target.matches('[data-team-name-index]')) {
    const index = Number(event.target.dataset.teamNameIndex);
    state.draft.teamNames[index] = event.target.value;
    persistState();
  }
}

function handleGlobalSubmit(event) {
  if (event.target === dom.newTournamentForm) {
    event.preventDefault();
    launchTournament();
  }
}

function handleGlobalChange(event) {
  handleGlobalInput(event);
}

function handleStepperButtons() {
  addListenerIfPresent(dom.participantMinusBtn, 'click', () => {
    hideSimulationPanel();
    state.draft.participantCount = clampSetupCount(state.draft.participantCount - 1, 24);
    renderNewTournamentView();
    persistState();
  });
  addListenerIfPresent(dom.participantPlusBtn, 'click', () => {
    hideSimulationPanel();
    state.draft.participantCount = clampSetupCount(state.draft.participantCount + 1, 24);
    renderNewTournamentView();
    persistState();
  });
  addListenerIfPresent(dom.fieldMinusBtn, 'click', () => {
    hideSimulationPanel();
    state.draft.fields = clampNumber(state.draft.fields - 1, 1, 20, 2);
    renderNewTournamentView();
    persistState();
  });
  addListenerIfPresent(dom.fieldPlusBtn, 'click', () => {
    hideSimulationPanel();
    state.draft.fields = clampNumber(state.draft.fields + 1, 1, 20, 2);
    renderNewTournamentView();
    persistState();
  });
  addListenerIfPresent(dom.durationMinusBtn, 'click', () => {
    hideSimulationPanel();
    state.draft.duration = clampNumber(state.draft.duration - 1, 1, 60, 7);
    renderTimeSection();
    renderNewTournamentSummary();
    persistState();
  });
  addListenerIfPresent(dom.durationPlusBtn, 'click', () => {
    hideSimulationPanel();
    state.draft.duration = clampNumber(state.draft.duration + 1, 1, 60, 7);
    renderTimeSection();
    renderNewTournamentSummary();
    persistState();
  });
  if (dom.challengeRangeMinusBtn) {
    addListenerIfPresent(dom.challengeRangeMinusBtn, 'click', () => {
      hideSimulationPanel();
      state.draft.challengeRange = clampNumber((state.draft.challengeRange || 5) - 1, 1, 10, 5);
      if (dom.challengeRangeLabel) dom.challengeRangeLabel.textContent = `±${state.draft.challengeRange}`;
      if (dom.challengeRangeInput) dom.challengeRangeInput.value = state.draft.challengeRange;
      persistState();
    });
    addListenerIfPresent(dom.challengeRangePlusBtn, 'click', () => {
      hideSimulationPanel();
      state.draft.challengeRange = clampNumber((state.draft.challengeRange || 5) + 1, 1, 10, 5);
      if (dom.challengeRangeLabel) dom.challengeRangeLabel.textContent = `±${state.draft.challengeRange}`;
      if (dom.challengeRangeInput) dom.challengeRangeInput.value = state.draft.challengeRange;
      persistState();
    });
  }
  if (dom.poolSizeMinusBtn) {
    addListenerIfPresent(dom.poolSizeMinusBtn, 'click', () => {
      hideSimulationPanel();
      state.draft.poolSize = clampNumber((state.draft.poolSize || 4) - 1, 3, 6, 4);
      if (dom.poolSizeLabel) dom.poolSizeLabel.textContent = `${state.draft.poolSize}`;
      if (dom.poolSizeInput) dom.poolSizeInput.value = state.draft.poolSize;
      persistState();
    });
    addListenerIfPresent(dom.poolSizePlusBtn, 'click', () => {
      hideSimulationPanel();
      state.draft.poolSize = clampNumber((state.draft.poolSize || 4) + 1, 3, 6, 4);
      if (dom.poolSizeLabel) dom.poolSizeLabel.textContent = `${state.draft.poolSize}`;
      if (dom.poolSizeInput) dom.poolSizeInput.value = state.draft.poolSize;
      persistState();
    });
  }
  addListenerIfPresent(dom.challengeAlphaBtn, 'click', () => {
    applyDraftChallengePlacementMode('alpha');
    renderChallengeSetupSection();
    renderNewTournamentSummary();
    persistState();
  });
  addListenerIfPresent(dom.challengeRandomBtn, 'click', () => {
    applyDraftChallengePlacementMode('random');
    renderChallengeSetupSection();
    renderNewTournamentSummary();
    persistState();
  });
  addListenerIfPresent(dom.challengeManualBtn, 'click', () => {
    applyDraftChallengePlacementMode('manual');
    renderChallengeSetupSection();
    renderNewTournamentSummary();
    persistState();
  });
}

/* === Initialisation === */

function cacheDom() {
  dom.startNewTournamentBtn = document.getElementById('startNewTournamentBtn');
  dom.resumeSessionBtn = document.getElementById('resumeSessionBtn');
  dom.classroomsBtn = document.getElementById('classroomsBtn');
  dom.helpBtn = document.getElementById('helpBtn');
  dom.lastStatsBtn = document.getElementById('lastStatsBtn');
  dom.helpModal = document.getElementById('helpModal');
  dom.closeHelpBtn = document.getElementById('closeHelpBtn');
  dom.helpLaunchBtn = document.getElementById('helpLaunchBtn');
  dom.newTournamentForm = document.getElementById('newTournamentForm');
  dom.newStepTitle = document.getElementById('newStepTitle');
  dom.newStepDescription = document.getElementById('newStepDescription');
  dom.newStepProgress = document.getElementById('newStepProgress');
  dom.newStepNavHint = document.getElementById('newStepNavHint');
  dom.newStepPrevBtn = document.getElementById('newStepPrevBtn');
  dom.newStepNextBtn = document.getElementById('newStepNextBtn');
  dom.newWizardNav = document.querySelector('.new-wizard-nav');
  dom.newWizardSteps = document.getElementById('newWizardSteps');
  dom.newWizardSummary = document.getElementById('newWizardSummary');
  dom.newWizardInlineSummary = document.getElementById('newWizardInlineSummary');
  dom.analysisPanel = document.getElementById('analysisPanel');
  dom.analysisModifyBtn = document.getElementById('analysisModifyBtn');
  dom.skipNamesStepBtn = document.getElementById('skipNamesStepBtn');
  dom.validationAnalysis = document.getElementById('validationAnalysis');
  dom.formatCards = document.getElementById('formatCards');
  dom.participantCountInput = document.getElementById('participantCountInput');
  dom.participantCountLabel = document.getElementById('participantCountLabel');
  dom.participantMinusBtn = document.getElementById('participantMinusBtn');
  dom.participantPlusBtn = document.getElementById('participantPlusBtn');
  dom.configSuggestions = document.getElementById('configSuggestions');
  dom.teamNamesSection = document.getElementById('teamNamesSection');
  dom.teamNamesGrid = document.getElementById('teamNamesGrid');
  dom.studentNamesSection = document.getElementById('studentNamesSection');
  dom.studentNamesInput = document.getElementById('studentNamesInput');
  dom.ladderSetupSection = document.getElementById('ladderSetupSection');
  dom.ladderArbitratedFields = document.getElementById('ladderArbitratedFields');
  dom.ladderPlacementStatus = document.getElementById('ladderPlacementStatus');
  dom.ladderPlacementGrid = document.getElementById('ladderPlacementGrid');
  dom.ladderUnplacedList = document.getElementById('ladderUnplacedList');
  dom.ladderAlphaBtn = document.getElementById('ladderAlphaBtn');
  dom.ladderRandomBtn = document.getElementById('ladderRandomBtn');
  dom.ladderManualBtn = document.getElementById('ladderManualBtn');
  dom.fieldCountInput = document.getElementById('fieldCountInput');
  dom.fieldCountLabel = document.getElementById('fieldCountLabel');
  dom.fieldMinusBtn = document.getElementById('fieldMinusBtn');
  dom.fieldPlusBtn = document.getElementById('fieldPlusBtn');
  dom.startTimeInput = document.getElementById('startTimeInput');
  dom.endTimeInput = document.getElementById('endTimeInput');
  dom.timingSummary = document.getElementById('timingSummary');
  dom.matchDurationInput = document.getElementById('matchDurationInput');
  dom.matchDurationLabel = document.getElementById('matchDurationLabel');
  dom.durationMinusBtn = document.getElementById('durationMinusBtn');
  dom.durationPlusBtn = document.getElementById('durationPlusBtn');
  dom.rotatingRefereeInput = document.getElementById('rotatingRefereeInput');
  dom.scoreTableInput = document.getElementById('scoreTableInput');
  dom.sessionNameInput = document.getElementById('sessionNameInput');
  dom.sessionsList = document.getElementById('sessionsList');
  dom.exportAllSessionsBtn = document.getElementById('exportAllSessionsBtn');
  dom.liveModeLabel = document.getElementById('liveModeLabel');
  dom.liveSessionTitle = document.getElementById('liveSessionTitle');
  dom.liveRotationLabel = document.getElementById('liveRotationLabel');
  dom.timerLabel = document.getElementById('timerLabel');
  dom.timerStatus = document.getElementById('timerStatus');
  dom.timerProgressBar = document.getElementById('timerProgressBar');
  dom.timerStartBtn = document.getElementById('timerStartBtn');
  dom.timerPauseBtn = document.getElementById('timerPauseBtn');
  dom.timerResetBtn = document.getElementById('timerResetBtn');
  dom.openRankingBtn = document.getElementById('openRankingBtn');
  dom.liveHomeBtn = document.getElementById('liveHomeBtn');
  dom.closeRankingBtn = document.getElementById('closeRankingBtn');
  dom.rankingDrawer = document.getElementById('rankingDrawer');
  dom.liveRankingContent = document.getElementById('liveRankingContent');
  dom.liveMatches = document.getElementById('liveMatches');
  dom.prevRotationBtn = document.getElementById('prevRotationBtn');
  dom.saveSessionBtn = document.getElementById('saveSessionBtn');
  dom.nextRotationBtn = document.getElementById('nextRotationBtn');
  dom.finishTournamentBtn = document.getElementById('finishTournamentBtn');
  dom.summaryTitle = document.getElementById('summaryTitle');
  dom.summarySubtitle = document.getElementById('summarySubtitle');
  dom.summaryContent = document.getElementById('summaryContent');
  dom.printSummaryBtn = document.getElementById('printSummaryBtn');
  dom.saveSummaryBtn = document.getElementById('saveSummaryBtn');
  dom.exportCsvBtn = document.getElementById('exportCsvBtn');
  dom.addClassroomBtn = document.getElementById('addClassroomBtn');
  dom.classroomsList = document.getElementById('classroomsList');
  dom.classroomDetailTitle = document.getElementById('classroomDetailTitle');
  dom.classroomDetailMeta = document.getElementById('classroomDetailMeta');
  dom.classroomDetailContent = document.getElementById('classroomDetailContent');
  dom.challengeRangeBlock = document.getElementById('challengeRangeBlock');
  dom.challengeRangeInput = document.getElementById('challengeRangeInput');
  dom.challengeRangeLabel = document.getElementById('challengeRangeLabel');
  dom.challengeRangeMinusBtn = document.getElementById('challengeRangeMinusBtn');
  dom.challengeRangePlusBtn = document.getElementById('challengeRangePlusBtn');
  dom.challengeSetupSection = document.getElementById('challengeSetupSection');
  dom.challengePlacementStatus = document.getElementById('challengePlacementStatus');
  dom.challengePlacementGrid = document.getElementById('challengePlacementGrid');
  dom.challengeUnplacedList = document.getElementById('challengeUnplacedList');
  dom.challengeAlphaBtn = document.getElementById('challengeAlphaBtn');
  dom.challengeRandomBtn = document.getElementById('challengeRandomBtn');
  dom.challengeManualBtn = document.getElementById('challengeManualBtn');
  dom.poolSizeBlock = document.getElementById('poolSizeBlock');
  dom.poolSizeInput = document.getElementById('poolSizeInput');
  dom.poolSizeLabel = document.getElementById('poolSizeLabel');
  dom.poolSizeMinusBtn = document.getElementById('poolSizeMinusBtn');
  dom.poolSizePlusBtn = document.getElementById('poolSizePlusBtn');
  dom.simulateSessionBtn = document.getElementById('simulateSessionBtn');
  dom.simulationPanel = document.getElementById('simulationPanel');
}

function bindEvents() {
  document.addEventListener('click', handleGlobalClick);
  document.addEventListener('input', handleGlobalInput);
  document.addEventListener('change', handleGlobalChange);
  document.addEventListener('submit', handleGlobalSubmit);
  const liveHeaderInfo = document.getElementById('liveHeaderInfo');
  const liveHeader = document.getElementById('liveHeader');
  if (liveHeaderInfo && liveHeader) {
    liveHeaderInfo.addEventListener('click', () => {
      liveHeader.classList.toggle('collapsed');
    });
  }
  if (dom.classroomsBtn) dom.classroomsBtn.addEventListener('click', () => showView('classrooms'));
  if (dom.helpModal) {
    dom.helpModal.addEventListener('click', event => {
      if (event.target === dom.helpModal) {
        dom.helpModal.classList.add('hidden');
      }
    });
  }
  if (dom.addClassroomBtn) dom.addClassroomBtn.addEventListener('click', () => promptCreateClassroom());
  if (dom.liveHomeBtn) {
    dom.liveHomeBtn.addEventListener('click', () => {
      if (confirm('Revenir à l\'accueil ? Le tournoi en cours sera conservé dans "Reprendre une séance".')) {
        saveSessionLocally();
        showView('home');
      }
    });
  }
  if (dom.finishTournamentBtn) {
    dom.finishTournamentBtn.addEventListener('click', () => {
      if (confirm('Terminer le tournoi et voir les statistiques finales ?')) {
        finishTournament();
      }
    });
  }
  handleStepperButtons();
}

function init() {
  cacheDom();
  bindEvents();
  renderHelpTabs(runtime.helpTab);
  renderHomeView();
  renderNewTournamentView();
  renderSessionsView();
  if (state.currentSession) {
    resetTimer();
  }
  showView(state.view);
}

if (typeof window !== 'undefined') {
  window.runScheduleStressAudit = runScheduleStressAudit;
}

document.addEventListener('DOMContentLoaded', init);
