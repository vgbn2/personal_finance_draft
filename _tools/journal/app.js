// ── DATA ──────────────────────────────────────────────────────

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// These will be overridden by schedule.json if available
let TIMETABLE = {};
let TERMINUS_TASKS = [];
let THCS2_TOPICS = [];

// ── STATE ─────────────────────────────────────────────────────

function loadState() {
    try {
        return JSON.parse(localStorage.getItem('terminus_dash') || '{}');
    } catch { return {}; }
}

function saveState(state) {
    localStorage.setItem('terminus_dash', JSON.stringify(state));
}

let state = loadState();
if (!state.tasks) state.tasks = {};
if (!state.thcs2_done) state.thcs2_done = {};
if (!state.thcs2_topic_index) state.thcs2_topic_index = 0;
if (!state.log) state.log = [];
if (!state.streak) state.streak = 0;
if (!state.last_end_day) state.last_end_day = null;

// ── HELPERS ───────────────────────────────────────────────────

function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function formatDate(d) {
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function getDayTasks(dayName) {
    return TERMINUS_TASKS.filter(t => !state.tasks[t.id]);
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// ── DATA SYNC ─────────────────────────────────────────────────

async function initData() {
    try {
        const response = await fetch('schedule.json');
        const data = await response.json();

        // Sync Timetable
        TIMETABLE = data.weekly_timetable || {};

        // Sync Tasks
        TERMINUS_TASKS = data.terminus_roadmap.phase_11.tasks || [];

        // Sync THCS2
        THCS2_TOPICS = data.thcs2_prep.progression || [];

        render();
    } catch (err) {
        console.warn('Could not load schedule.json, using defaults (hardcoded fallback)', err);
        // Fallback data if fetch fails
        TIMETABLE = {
            monday: [
                { subject: 'ELE1309', name: 'Điện tử số', time: '07:00–08:40', room: '605-A2' },
                { subject: 'ELE13101', name: 'Xử lý tín hiệu số', time: '12:30–15:05', room: '705-A2' },
            ],
            tuesday: [
                { subject: 'ELE1309', name: 'Điện tử số (Lab)', time: '07:50–11:15', room: '602-A3' },
            ],
            wednesday: [],
            thursday: [
                { subject: 'TEL1345', name: 'Kỹ thuật siêu cao tần', time: '08:40–11:15', room: '705-A2' },
            ],
            friday: [
                { subject: 'TEL1344', name: 'Lý thuyết truyền tin', time: '07:00–09:35', room: '605-A2' },
                { subject: 'BAS1122', name: 'Tư tưởng HCM', time: '12:30–15:05', room: '201-A2' },
            ],
            saturday: [
                { subject: 'BSA1221', name: 'Pháp luật đại cương', time: '07:00–11:15', room: '101-A3' },
                { subject: 'SKD1102', name: 'Kỹ năng làm việc nhóm', time: '15:05–16:45', room: '801-A2' },
            ],
            sunday: []
        };
        TERMINUS_TASKS = [
            { id: 1, name: 'COIN_REGISTRY', hours: 1 },
            // ... same as before
        ];
        THCS2_TOPICS = ['Arrays and strings', 'Pointers', 'Structs', 'Linked lists', 'Stacks and queues', 'Sorting algorithms', 'Recursion', 'File I/O', 'Past papers'];
        render();
    }
}

// ── RENDER ────────────────────────────────────────────────────

function render() {
    const now = new Date();
    const dayIndex = now.getDay();
    const dayName = DAYS[dayIndex];

    document.getElementById('dayName').textContent = DAY_NAMES[dayIndex];
    document.getElementById('dateStr').textContent = formatDate(now).toUpperCase();

    const streak = state.streak || 0;
    if (streak > 0) {
        document.getElementById('streakInfo').innerHTML = `<span>${streak}</span> day streak`;
    }

    const doneCount = Object.keys(state.tasks).filter(k => state.tasks[k]).length;
    document.getElementById('doneCount').textContent = doneCount;
    document.getElementById('progressFill').style.width = `${(doneCount / TERMINUS_TASKS.length) * 100}%`;

    const classes = TIMETABLE[dayName] || [];
    const classesList = document.getElementById('classesList');
    if (classes.length === 0) {
        classesList.innerHTML = `<div class="no-class">No classes — <span>full Terminus day</span></div>`;
    } else {
        classesList.innerHTML = classes.map(c => `
      <div class="class-item">
        <div>
          <div class="class-name">${c.name}</div>
          <div class="class-meta">${c.subject || c.code}${c.note ? ' · ' + c.note : ''}</div>
        </div>
        <div class="class-time">${c.time || c.time_start + '–' + c.time_end}<br><span style="color:var(--muted);font-size:9px">${c.room}</span></div>
      </div>
    `).join('');
    }

    const pending = TERMINUS_TASKS.filter(t => !state.tasks[t.id]);
    const toShow = pending.slice(0, 3);
    const terminusList = document.getElementById('terminusList');

    if (pending.length === 0 && TERMINUS_TASKS.length > 0) {
        terminusList.innerHTML = `<div class="no-class"><span>Phase complete ✓</span></div>`;
    } else {
        terminusList.innerHTML = toShow.map((t, i) => `
      <div class="task-item task-accent ${state.tasks[t.id] ? 'done' : ''}" onclick="toggleTask(${t.id})">
        <div class="checkbox"><span class="checkbox-tick">✓</span></div>
        <div class="task-content">
          <div class="task-name">${t.name}</div>
          <div class="task-sub">Task ${t.id} of ${TERMINUS_TASKS.length}</div>
        </div>
        <div class="task-hours">~${t.hours}h</div>
      </div>
    `).join('');

        if (pending.length > 3) {
            terminusList.innerHTML += `<div style="font-size:10px;color:var(--muted);padding:6px 2px">+${pending.length - 3} more tasks remaining</div>`;
        }
    }

    const thcs2Section = document.getElementById('thcs2Section');
    const thcs2Item = document.getElementById('thcs2Item');
    const todayK = todayKey();
    const topic = THCS2_TOPICS[state.thcs2_topic_index || 0];

    if (dayName === 'tuesday') {
        thcs2Section.style.display = 'block';
        const thcsDone = state.thcs2_done[todayK];
        thcs2Item.innerHTML = `
      <div class="task-item task-orange ${thcsDone ? 'done' : ''}" onclick="toggleThcs2()">
        <div class="checkbox"><span class="checkbox-tick">✓</span></div>
        <div class="task-content">
          <div class="task-name">${topic}</div>
          <div class="task-sub">1h · paper first · edge cases · ${state.thcs2_topic_index + 1}/${THCS2_TOPICS.length}</div>
        </div>
        <div class="task-hours">~1h</div>
      </div>
    `;
    } else {
        thcs2Section.style.display = 'none';
    }

    document.getElementById('stuckInput').value = state[`stuck_${todayK}`] || '';
    document.getElementById('noteInput').value = state[`note_${todayK}`] || '';
}

// ── INTERACTIONS ──────────────────────────────────────────────

function toggleTask(id) {
    state.tasks[id] = !state.tasks[id];
    saveState(state);
    render();
}

function toggleThcs2() {
    const k = todayKey();
    state.thcs2_done[k] = !state.thcs2_done[k];
    saveState(state);
    render();
}

function endDay() {
    const todayK = todayKey();
    const now = new Date();
    const dayIndex = now.getDay();

    state[`stuck_${todayK}`] = document.getElementById('stuckInput').value;
    state[`note_${todayK}`] = document.getElementById('noteInput').value;

    const doneTasks = TERMINUS_TASKS.filter(t => state.tasks[t.id]).map(t => t.name);
    const thcsDone = state.thcs2_done[todayK];

    state.log.push({
        date: todayK,
        day: DAY_NAMES[dayIndex],
        terminus_tasks_total_done: doneTasks.length,
        thcs2: thcsDone || false,
        stuck: state[`stuck_${todayK}`],
        note: state[`note_${todayK}`],
        timestamp: Date.now()
    });

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth() + 1}-${yesterday.getDate()}`;
    if (state.last_end_day === yesterdayKey) {
        state.streak = (state.streak || 0) + 1;
    } else if (state.last_end_day !== todayK) {
        state.streak = 1;
    }
    state.last_end_day = todayK;

    saveState(state);
    showToast('Day logged ✓');
    render();
}

function toggleTomorrow() {
    const preview = document.getElementById('tomorrowPreview');
    if (preview.classList.contains('show')) {
        preview.classList.remove('show');
        return;
    }

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDay = DAYS[tomorrow.getDay()];
    const classes = TIMETABLE[tomorrowDay] || [];
    const pending = TERMINUS_TASKS.filter(t => !state.tasks[t.id]).slice(0, 2);
    const topic = THCS2_TOPICS[state.thcs2_topic_index || 0];

    let html = `<div style="font-size:11px;color:var(--text);margin-bottom:8px;font-weight:600">${DAY_NAMES[tomorrow.getDay()]} ${formatDate(tomorrow)}</div>`;

    if (classes.length === 0) {
        html += `<div class="tomorrow-item"><span class="dot">·</span> No classes</div>`;
    } else {
        classes.forEach(c => {
            html += `<div class="tomorrow-item"><span class="dot" style="color:var(--blue)">·</span> ${c.time || c.time_start + '–' + c.time_end} ${c.name}</div>`;
        });
    }

    pending.forEach(t => {
        html += `<div class="tomorrow-item"><span class="dot">·</span> ${t.name} (~${t.hours}h)</div>`;
    });

    if (tomorrowDay === 'tuesday') {
        html += `<div class="tomorrow-item"><span class="dot" style="color:var(--orange)">·</span> THCS2: ${topic}</div>`;
    }

    if (tomorrowDay === 'sunday') {
        html += `<div class="tomorrow-item"><span class="dot" style="color:var(--red)">·</span> REST DAY — no Terminus</div>`;
    }

    document.getElementById('tomorrowList').innerHTML = html;
    preview.classList.add('show');
}

// Global initialization
window.onload = initData;
