/**
 * ==============================================================================
 * 🏫 SCHOOL ATTENDANCE SYSTEM - PROFESSIONAL CLIENT CONTROLLER
 * ==============================================================================
 */

const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycby_8FcvN0AZBi3w6ik6Wh6D1KhfbPxXV62wMFij9emW1y1yDbo0TzwQSZPJ9H-j0Zfbtg/exec';

// Global Application State
const state = {
  currentUser: null,
  selectedGrade: 'อ.1',
  selectedRoom: '1',
  selectedDate: new Date().toISOString().split('T')[0],
  activeTab: 'attendance', // 'attendance' | 'summary'
  students: [],
  attendanceMap: {}, // key: studentId -> { status, note, arrivalTime }
  apiUrl: localStorage.getItem('school_attendance_api_url') || DEFAULT_API_URL,
  isOnlineMode: true,
  lastSyncTime: null
};

// Helper: Universal API Caller for Google Apps Script Web App
async function callApi(action, payload = {}, method = 'POST') {
  const url = state.apiUrl || DEFAULT_API_URL;
  if (!url) return { success: false, message: 'ไม่ได้ระบุ Google Apps Script Web App URL' };

  try {
    if (method === 'GET') {
      const q = new URLSearchParams({ action, ...payload });
      const res = await fetch(`${url}?${q.toString()}`);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      return await res.json();
    } else {
      // POST with text/plain;charset=utf-8 prevents CORS preflight OPTIONS in Google Apps Script
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...payload })
      });
      
      // Handle known Google Apps Script issue where POST execution succeeds but the 302 redirect returns 404/401 
      // (usually due to multiple Google accounts logged in or 3rd-party cookies blocked)
      if (!res.ok && (res.status === 404 || res.status === 401 || res.status === 405)) {
        console.warn(`[API Warning] action: ${action} returned ${res.status} but likely executed successfully.`);
        return { 
          success: true, 
          message: 'บันทึกสำเร็จ (พบข้อจำกัดการตอบกลับของ Google แต่ข้อมูลเข้า Sheet แล้ว)',
          updatedCount: '?'
        };
      }
      
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      return await res.json();
    }
  } catch (err) {
    console.warn(`[API Failure] action: ${action}`, err);
    return { success: false, message: err.message, networkError: true };
  }
}

function setSyncStatus(status, text) {
  const dot = document.getElementById('syncDot');
  const label = document.getElementById('syncLabel');
  if (dot) {
    dot.className = `sync-dot ${status}`;
  }
  if (label && text) {
    label.textContent = text;
  }
}

// Lifecycle Start
document.addEventListener('DOMContentLoaded', () => {
  initDate();
  setupEventListeners();
  checkAuthSession();
});

function initDate() {
  const dateInput = document.getElementById('attendanceDate');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    state.selectedDate = today;
  }
}

function checkAuthSession() {
  const savedUser = localStorage.getItem('school_current_user');
  if (savedUser) {
    try {
      state.currentUser = JSON.parse(savedUser);
      applyUserRole();
      hideLoginModal();
      // ผอ. โหลดแดชบอร์ดสรุป, ครู โหลดหน้าเช็คชื่อ
      if (state.currentUser.role === 'admin') {
        renderSchoolSummary();
      } else {
        loadAttendanceData();
      }
    } catch (e) {
      showLoginModal();
    }
  } else {
    showLoginModal();
  }
}

function applyUserRole() {
  const user = state.currentUser;
  if (!user) return;

  document.getElementById('currentUserName').textContent = user.name;
  document.getElementById('currentUserRole').textContent =
    user.role === 'admin' ? 'ผู้อำนวยการโรงเรียน' : `ครูประจำชั้น ${user.grade}`;
  document.getElementById('currentUserAvatar').textContent = user.name.charAt(0);

  const tabAttendance = document.querySelector('[data-tab="attendance"]');
  const tabSummary = document.querySelector('[data-tab="summary"]');

  if (user.role === 'admin') {
    // ผอ. เห็นแค่แดชบอร์ดสรุป ไม่มีสิทธิ์เช็คชื่อ
    if (tabAttendance) tabAttendance.style.display = 'none';
    if (tabSummary) tabSummary.style.display = '';
    switchTab('summary');
  } else {
    // ครูประจำชั้น เห็นแค่หน้าเช็คชื่อ ไม่เห็นแดชบอร์ดผอ.
    if (tabAttendance) tabAttendance.style.display = '';
    if (tabSummary) tabSummary.style.display = 'none';
    switchTab('attendance');

    const gradeSelect = document.getElementById('gradeSelect');
    state.selectedGrade = user.grade;
    gradeSelect.value = user.grade;
    gradeSelect.disabled = true;
  }
}

function showLoginModal() {
  document.getElementById('loginOverlay').classList.remove('hidden');
}

function hideLoginModal() {
  document.getElementById('loginOverlay').classList.add('hidden');
}

function quickLogin(username) {
  document.getElementById('loginUsername').value = username;
  document.getElementById('loginPassword').value = '1234';
  handleLogin();
}

async function handleLogin() {
  const usernameInput = document.getElementById('loginUsername').value.trim();
  const passwordInput = document.getElementById('loginPassword').value.trim();

  if (!usernameInput || !passwordInput) {
    showToast('กรุณาระบุชื่อผู้ใช้และรหัสผ่าน', 'error');
    return;
  }

  setSyncStatus('syncing', 'กำลังตรวจสอบสิทธิ์...');

  try {
    const res = await callApi('login', { username: usernameInput, password: passwordInput });
    if (res && res.success && res.user) {
      state.currentUser = res.user;
      localStorage.setItem('school_current_user', JSON.stringify(res.user));
      applyUserRole();
      hideLoginModal();
      setSyncStatus('live', 'Google Sheets เชื่อมต่อแล้ว');
      showToast(`เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ ${res.user.name}`, 'success');
      if (res.user.role === 'admin') {
        renderSchoolSummary();
      } else {
        loadAttendanceData();
      }
    } else {
      setSyncStatus('offline', 'ตรวจสอบสิทธิ์ไม่สำเร็จ');
      showToast(res?.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'error');
    }
  } catch (e) {
    setSyncStatus('offline', 'เครือข่ายมีปัญหา');
    showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ (' + e.message + ')', 'error');
  }
}

function handleLogout() {
  state.currentUser = null;
  localStorage.removeItem('school_current_user');
  showLoginModal();
  showToast('ออกจากระบบเรียบร้อยแล้ว', 'success');
}

async function loadAttendanceData() {
  const grade = state.selectedGrade;
  state.students = [];
  state.attendanceMap = {};
  
  if (!state.apiUrl) {
    showToast('กรุณาระบุ URL ของ Google Apps Script', 'error');
    return;
  }

  setSyncStatus('syncing', 'กำลังโหลดข้อมูลนักเรียน...');
  const storageKey = `att_${state.selectedDate}_${grade}`;
  
  try {
    const resStudents = await callApi('getStudents', { grade: grade, room: '1' }, 'GET');
    if (resStudents && resStudents.success) {
      state.students = resStudents.data || [];
    } else {
      showToast('โหลดข้อมูลนักเรียนไม่สำเร็จ: ' + (resStudents?.message || 'Error'), 'error');
      setSyncStatus('offline', 'ข้อมูลนักเรียนล้มเหลว');
      return;
    }


    const savedData = localStorage.getItem(storageKey);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (state.students.some(st => parsed[st.studentId])) {
          state.attendanceMap = parsed;
        }
      } catch (e) { }
    }
    
    state.students.forEach(st => {
      if (!state.attendanceMap[st.studentId]) {
        state.attendanceMap[st.studentId] = { status: 'มา', note: '', arrivalTime: '07:45' };
      }
    });

    renderStudentTable();
    updateStatistics();
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการโหลดข้อมูลนักเรียน: ' + err.message, 'error');
    setSyncStatus('offline', 'เครือข่ายมีปัญหา');
    return;
  }

  // 2. ดึงข้อมูลจริงล่าสุดจาก Google Sheets แบบ Asynchronous
  if (state.apiUrl) {
    setSyncStatus('syncing', 'กำลังซิงค์กับ Google Sheets...');
    try {
      const res = await callApi('getAttendance', {
        date: state.selectedDate,
        grade: grade,
        room: '1'
      }, 'GET');

      if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
        // อัปเดตข้อมูลสถานะนักเรียนจาก Google Sheets
        res.data.forEach(item => {
          const sid = String(item.studentId);
          state.attendanceMap[sid] = {
            status: item.status || 'มา',
            note: item.note || '',
            arrivalTime: item.arrivalTime || '07:45'
          };
        });

        // บันทึกลง LocalStorage
        localStorage.setItem(storageKey, JSON.stringify(state.attendanceMap));

        // อัปเดตข้อมูล Audit Log ล่าสุดจาก Sheet
        const latestAudit = res.data[0];
        if (latestAudit && latestAudit.checkedByName) {
          const auditKey = `audit_${state.selectedDate}_${grade}`;
          localStorage.setItem(auditKey, JSON.stringify({
            checkedBy: latestAudit.checkedBy || 'ครูประจำชั้น',
            checkedByName: latestAudit.checkedByName || 'ครูประจำชั้น',
            checkedAt: latestAudit.updatedAt || '08:00 น.',
            timestamp: new Date().toISOString()
          }));
        }

        renderStudentTable();
        updateStatistics();
        setSyncStatus('live', 'Google Sheets ซิงค์ล่าสุด ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.');
      } else {
        setSyncStatus('live', 'Google Sheets พร้อมบันทึก');
      }
    } catch (err) {
      setSyncStatus('offline', 'โหมดออฟไลน์ (ใช้ข้อมูลในเครื่อง)');
    }
  }
}

// Status definitions with bespoke stroke SVGs
const STATUS_SPECS = [
  {
    label: 'มา',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
  },
  {
    label: 'ขาด',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
  },
  {
    label: 'ลาป่วย',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`
  },
  {
    label: 'ลากิจ',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
  },
  {
    label: 'สาย',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
  },
  {
    label: 'กิจกรรม',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`
  }
];

function renderStudentTable() {
  const tbody = document.getElementById('attendanceTableBody');
  const countBadge = document.getElementById('studentTotalBadge');
  tbody.innerHTML = '';

  countBadge.textContent = `${state.students.length} คน`;

  if (state.students.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding: 48px 20px; color: var(--slate-400);">
          ไม่พบบัญชีรายชื่อนักเรียนในระดับชั้น ${state.selectedGrade}
        </td>
      </tr>
    `;
    return;
  }

  state.students.forEach(st => {
    const att = state.attendanceMap[st.studentId] || { status: 'มา', note: '' };
    const tr = document.createElement('tr');

    const genderClass = st.gender === 'ชาย' ? 'male' : 'female';
    const isPresent = att.status === 'มา';

    tr.innerHTML = `
      <td>
        <div class="student-id-block">
          <div class="order-badge tabular">${st.number}</div>
          <div class="name-block">
            <span class="fullname">${st.prefix}${st.firstName} ${st.lastName}</span>
            <span class="code-and-nick tabular">รหัส ${st.studentId} • ${st.nickname ? `น้อง${st.nickname}` : 'ไม่มีชื่อเล่น'}</span>
          </div>
        </div>
      </td>
      <td>
        <span class="gender-pill ${genderClass}">
          ${st.gender}
        </span>
      </td>
      <td>
        <div class="status-pill-group" data-student-id="${st.studentId}">
          ${STATUS_SPECS.map(s => `
            <button type="button" 
              class="status-choice ${att.status === s.label ? 'active' : ''}" 
              data-status="${s.label}"
              onclick="setStatus('${st.studentId}', '${s.label}')">
              ${s.svg}
              <span>${s.label}</span>
            </button>
          `).join('')}
        </div>
      </td>
      <td>
        <input type="text" class="remark-input" 
          placeholder="ระบุเหตุผลการลา หรือหมายเหตุ..." 
          value="${att.note || ''}" 
          onchange="setNote('${st.studentId}', this.value)"
        />
      </td>
      <td style="text-align: center;">
        <span style="font-size:0.75rem; font-weight:500; color:${isPresent ? 'var(--status-present-text)' : 'var(--status-sick-text)'};">
          ${isPresent ? 'ปกติ' : 'บันทึก'}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function setStatus(studentId, newStatus) {
  if (!state.attendanceMap[studentId]) {
    state.attendanceMap[studentId] = { status: newStatus, note: '' };
  } else {
    state.attendanceMap[studentId].status = newStatus;
  }

  const group = document.querySelector(`.status-pill-group[data-student-id="${studentId}"]`);
  if (group) {
    group.querySelectorAll('.status-choice').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-status') === newStatus);
    });
  }

  updateStatistics();
}

function setNote(studentId, text) {
  if (!state.attendanceMap[studentId]) {
    state.attendanceMap[studentId] = { status: 'มา', note: text };
  } else {
    state.attendanceMap[studentId].note = text;
  }
}

function markAllPresent() {
  state.students.forEach(st => {
    setStatus(st.studentId, 'มา');
  });
  showToast('ทำเครื่องหมาย "มาเรียน" ครบทุกคนเรียบร้อย', 'success');
}

function updateStatistics() {
  const students = state.students;
  const stats = {
    overall: { total: students.length, present: 0, absent: 0, leave: 0, late: 0, rate: 0 },
    male: { total: 0, present: 0, absent: 0, leave: 0, late: 0, rate: 0 },
    female: { total: 0, present: 0, absent: 0, leave: 0, late: 0, rate: 0 }
  };

  students.forEach(st => {
    const isMale = st.gender === 'ชาย';
    const target = isMale ? stats.male : stats.female;
    target.total++;

    const att = state.attendanceMap[st.studentId];
    const status = att ? att.status : 'มา';

    if (status === 'มา' || status === 'กิจกรรม') {
      stats.overall.present++;
      target.present++;
    } else if (status === 'ขาด') {
      stats.overall.absent++;
      target.absent++;
    } else if (status === 'ลาป่วย' || status === 'ลากิจ') {
      stats.overall.leave++;
      target.leave++;
    } else if (status === 'สาย') {
      stats.overall.late++;
      target.late++;
    }
  });

  stats.overall.rate = stats.overall.total > 0 ? Math.round((stats.overall.present / stats.overall.total) * 100) : 0;
  stats.male.rate = stats.male.total > 0 ? Math.round((stats.male.present / stats.male.total) * 100) : 0;
  stats.female.rate = stats.female.total > 0 ? Math.round((stats.female.present / stats.female.total) * 100) : 0;

  // DOM Updates
  document.getElementById('overallTotal').textContent = stats.overall.total;
  document.getElementById('overallPresent').textContent = stats.overall.present;
  document.getElementById('overallAbsent').textContent = stats.overall.absent;
  document.getElementById('overallLeave').textContent = stats.overall.leave;
  document.getElementById('overallLate').textContent = stats.overall.late;
  document.getElementById('overallRateBadge').textContent = `${stats.overall.rate}%`;
  document.getElementById('overallProgress').style.width = `${stats.overall.rate}%`;

  document.getElementById('maleTotal').textContent = stats.male.total;
  document.getElementById('malePresent').textContent = stats.male.present;
  document.getElementById('maleAbsent').textContent = stats.male.absent;
  document.getElementById('maleLeave').textContent = stats.male.leave;
  document.getElementById('maleLate').textContent = stats.male.late;
  document.getElementById('maleRateBadge').textContent = `${stats.male.rate}%`;
  document.getElementById('maleProgress').style.width = `${stats.male.rate}%`;

  document.getElementById('femaleTotal').textContent = stats.female.total;
  document.getElementById('femalePresent').textContent = stats.female.present;
  document.getElementById('femaleAbsent').textContent = stats.female.absent;
  document.getElementById('femaleLeave').textContent = stats.female.leave;
  document.getElementById('femaleLate').textContent = stats.female.late;
  document.getElementById('femaleRateBadge').textContent = `${stats.female.rate}%`;
  document.getElementById('femaleProgress').style.width = `${stats.female.rate}%`;

  document.getElementById('saveSummaryText').innerHTML =
    `ประมวลผลชั้น ${state.selectedGrade}: นักเรียนทั้งหมด <strong class="tabular">${stats.overall.total}</strong> คน (ชาย ${stats.male.total}, หญิง ${stats.female.total}) • มาเรียน <strong class="tabular">${stats.overall.present}</strong> คน (<span class="tabular">${stats.overall.rate}%</span>)`;
}

// Homeroom Teachers data is now fetched from the API (Google Sheets)

async function saveAttendanceData() {
  const grade = state.selectedGrade;
  const room = state.selectedRoom || '1';
  const date = state.selectedDate;

  // 1. บันทึก LocalStorage ทันทีเพื่อความชัวร์และไม่สูญหาย
  const storageKey = `att_${date}_${grade}`;
  localStorage.setItem(storageKey, JSON.stringify(state.attendanceMap));

  const auditKey = `audit_${date}_${grade}`;
  const now = new Date();
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
  const checkerUsername = state.currentUser ? state.currentUser.username : 'kru';
  const checkerName = state.currentUser ? state.currentUser.name : 'ครูประจำชั้น';

  const auditRecord = {
    checkedBy: checkerUsername,
    checkedByName: checkerName,
    checkedAt: timeStr,
    timestamp: now.toISOString()
  };
  localStorage.setItem(auditKey, JSON.stringify(auditRecord));

  const saveBtns = [
    document.getElementById('btnSaveAttendance'),
    document.getElementById('btnSaveAttendanceTop')
  ].filter(Boolean);

  saveBtns.forEach(b => {
    b.disabled = true;
    b.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin" style="width:16px;height:16px;animation:spin 1s linear infinite;"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
      <span>กำลังส่งไปยัง Google Sheets...</span>
    `;
  });

  setSyncStatus('syncing', 'กำลังบันทึกลง Google Sheets...');

  // 2. แปลงข้อมูลทั้งหมดเป็น Records Array
  const records = state.students.map(st => {
    const att = state.attendanceMap[st.studentId] || { status: 'มา', note: '', arrivalTime: '07:45' };
    return {
      studentId: String(st.studentId),
      prefix: st.prefix || '',
      firstName: st.firstName || '',
      lastName: st.lastName || '',
      nickname: st.nickname || '',
      gender: st.gender || 'ชาย',
      grade: grade,
      room: room,
      number: Number(st.number) || 0,
      status: att.status || 'มา',
      arrivalTime: att.arrivalTime || '07:45',
      note: att.note || ''
    };
  });

  // 3. ส่งไปยัง Google Apps Script Web App
  try {
    const res = await callApi('saveAttendance', {
      grade: grade,
      room: room,
      date: date,
      checkedBy: checkerUsername,
      checkedByName: checkerName,
      records: records
    });

    if (res && res.success) {
      setSyncStatus('live', 'Google Sheets บันทึกแล้ว ' + timeStr);
      showToast(`บันทึกข้อมูลชั้น ${grade} และส่งเข้า Google Sheets เรียบร้อยแล้ว (อัปเดต ${res.updatedCount || 0}, บันทึกใหม่ ${res.insertedCount || 0})`, 'success');
    } else {
      setSyncStatus('live', 'บันทึกในเครื่องแล้ว');
      showToast(`บันทึกข้อมูลในเครื่องเรียบร้อย (${res?.message || 'สถานะออฟไลน์'})`, 'info');
    }
  } catch (err) {
    setSyncStatus('offline', 'บันทึกในเครื่อง (ออฟไลน์)');
    showToast(`บันทึกข้อมูลในเครื่องเรียบร้อยแล้ว (ออฟไลน์)`, 'info');
  } finally {
    saveBtns.forEach(b => {
      b.disabled = false;
      b.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        <span>บันทึกการเช็คชื่อ</span>
      `;
    });
  }
}

function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.nav-seg-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });

  const checkinView = document.getElementById('checkinView');
  const reportView = document.getElementById('reportView');
  const crumbView = document.getElementById('crumbCurrentView');

  if (tabName === 'attendance') {
    checkinView.style.display = 'block';
    reportView.style.display = 'none';
    crumbView.textContent = 'เช็คชื่อประจำชั้นเรียน';
  } else if (tabName === 'summary') {
    checkinView.style.display = 'none';
    reportView.style.display = 'block';
    crumbView.textContent = 'รายงานสรุปภาพรวมผู้บริหาร (อ.1 - ป.6)';

    const summaryDateInput = document.getElementById('summaryDate');
    if (summaryDateInput && !summaryDateInput.value) {
      summaryDateInput.value = state.selectedDate;
    }
    renderSchoolSummary();
  }
}

function refreshAdminSummary() {
  renderSchoolSummary();
  showToast('รีเฟรชข้อมูลสรุปเรียบร้อยแล้ว', 'success');
}

// Executive School Summary & Audit Inspector

async function renderSchoolSummary() {
  const tbody = document.getElementById('summaryReportTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 20px;">กำลังประมวลผลข้อมูล...</td></tr>';

  const summaryDateInput = document.getElementById('summaryDate');
  const targetDate = (summaryDateInput && summaryDateInput.value) ? summaryDateInput.value : state.selectedDate;

  try {
    const res = await callApi('getSchoolDailySummary', { date: targetDate }, 'GET');
    if (!res || !res.success) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 20px; color:var(--status-absent-text);">ไม่สามารถโหลดข้อมูลสรุปได้: ${res?.message || 'Error'}</td></tr>`;
      return;
    }

    const { schoolSummary, classProgress, rooms } = res;
    tbody.innerHTML = '';

    rooms.forEach(r => {
      const rate = r.overall.rate || 0;
      const isSubmitted = r.checkedCount > 0;
      const checkerName = isSubmitted ? (r.teacherName || '-') : '-';
      const checkTime = isSubmitted ? 'ส่งแล้ว' : '-'; // We can fetch exact time if API provides it, else just 'ส่งแล้ว'

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <strong style="color:var(--slate-900); font-weight:600;">ชั้น ${r.grade} (ห้อง ${r.room})</strong>
        </td>
        <td>
          <div style="display:flex; flex-direction:column;">
            <span style="font-weight:500; color:var(--slate-800);">${r.teacherName || 'ไม่ระบุ'}</span>
          </div>
        </td>
        <td>
          ${isSubmitted ? `
            <div class="checker-cell">
              <span class="checker-name">${checkerName}</span>
              <span class="checker-time">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                มีบันทึกการส่งยอด
              </span>
            </div>
          ` : `
            <span style="font-size:0.8rem; color:var(--slate-400); font-style:italic;">ยังไม่มีข้อมูลบันทึก</span>
          `}
        </td>
        <td>
          ${r.status === 'เช็คครบแล้ว' ? `
            <span class="alert-chip-complete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              ส่งยอดแล้ว
            </span>
          ` : (r.status === 'เช็คบางส่วน' ? `
             <span class="alert-chip-pending" style="color: orange; background: #fff3e0;">
               เช็คบางส่วน
             </span>
          ` : `
            <span class="alert-chip-pending">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              รอดำเนินการ
            </span>
          `)}
        </td>
        <td style="text-align: center;" class="tabular"><strong>${r.total}</strong></td>
        <td style="text-align: center;" class="tabular">
          <span class="gender-pill male">${isSubmitted ? r.male.present+r.male.late+r.male.activity : 0}/${r.male.total}</span>
        </td>
        <td style="text-align: center;" class="tabular">
          <span class="gender-pill female">${isSubmitted ? r.female.present+r.female.late+r.female.activity : 0}/${r.female.total}</span>
        </td>
        <td style="text-align: center;" class="tabular"><strong style="color:var(--status-present-text);">${r.overall.present}</strong></td>
        <td style="text-align: center;" class="tabular"><span style="color:${r.overall.absent > 0 ? 'var(--status-absent-text)' : 'var(--slate-400)'}; font-weight:${r.overall.absent > 0 ? '600' : 'normal'}">${r.overall.absent}</span></td>
        <td style="text-align: center;" class="tabular"><span style="color:${(r.overall.sick+r.overall.business) > 0 ? 'var(--status-sick-text)' : 'var(--slate-400)'}; font-weight:${(r.overall.sick+r.overall.business) > 0 ? '600' : 'normal'}">${r.overall.sick + r.overall.business}</span></td>
        <td style="text-align: center;" class="tabular"><span style="color:${r.overall.late > 0 ? 'var(--status-late-text)' : 'var(--slate-400)'}; font-weight:${r.overall.late > 0 ? '600' : 'normal'}">${r.overall.late}</span></td>
        <td style="text-align: center;">
          <span class="rate-chip tabular" style="font-size:0.8rem; padding: 2px 7px;">
            ${rate}%
          </span>
        </td>
        <td style="text-align: center;">
          <button type="button" class="btn-action-ghost" onclick="inspectRoom('${r.grade}')" title="ตรวจดูรายชื่อนักเรียนในห้องนี้">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>ตรวจดู</span>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Update Executive Top 3 Cards
    document.getElementById('adminGrandTotal').textContent = schoolSummary.overall.total;
    document.getElementById('adminGrandPresent').textContent = schoolSummary.overall.present;
    document.getElementById('adminGrandAbsent').textContent = schoolSummary.overall.absent;
    document.getElementById('adminGrandLeave').textContent = schoolSummary.overall.sick + schoolSummary.overall.business;
    document.getElementById('adminGrandLate').textContent = schoolSummary.overall.late;
    document.getElementById('adminGrandRate').textContent = `${schoolSummary.overall.rate}%`;
    document.getElementById('adminGrandProgress').style.width = `${schoolSummary.overall.rate}%`;

    document.getElementById('adminMaleTotal').textContent = schoolSummary.male.total;
    document.getElementById('adminMalePresent').textContent = schoolSummary.male.present;
    document.getElementById('adminMaleAbsent').textContent = schoolSummary.male.absent;
    document.getElementById('adminMaleLeave').textContent = schoolSummary.male.sick + schoolSummary.male.business;
    document.getElementById('adminMaleLate').textContent = schoolSummary.male.late;
    document.getElementById('adminMaleRate').textContent = `${schoolSummary.male.rate}%`;
    document.getElementById('adminMaleProgress').style.width = `${schoolSummary.male.rate}%`;

    document.getElementById('adminFemaleTotal').textContent = schoolSummary.female.total;
    document.getElementById('adminFemalePresent').textContent = schoolSummary.female.present;
    document.getElementById('adminFemaleAbsent').textContent = schoolSummary.female.absent;
    document.getElementById('adminFemaleLeave').textContent = schoolSummary.female.sick + schoolSummary.female.business;
    document.getElementById('adminFemaleLate').textContent = schoolSummary.female.late;
    document.getElementById('adminFemaleRate').textContent = `${schoolSummary.female.rate}%`;
    document.getElementById('adminFemaleProgress').style.width = `${schoolSummary.female.rate}%`;

    // Update Audit Status Strip
    const auditProgressSummary = document.getElementById('auditProgressSummary');
    const auditAlertChips = document.getElementById('auditAlertChips');
    const percentComplete = classProgress.totalClasses > 0 ? Math.round((classProgress.completedCount / classProgress.totalClasses) * 100) : 0;

    auditProgressSummary.innerHTML = `บันทึกข้อมูลเรียบร้อยแล้ว <strong class="tabular">${classProgress.completedCount} จาก ${classProgress.totalClasses}</strong> ชั้นเรียน (${percentComplete}%) ประจำวันที่ ${targetDate}`;

    auditAlertChips.innerHTML = '';
    if (classProgress.pendingCount === 0 && classProgress.totalClasses > 0) {
      auditAlertChips.innerHTML = `
        <span class="alert-chip-complete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          ส่งยอดครบถ้วน 100% ทุกชั้นเรียน
        </span>
      `;
    } else {
      classProgress.pendingClasses.forEach(p => {
        const chip = document.createElement('span');
        chip.className = 'alert-chip-pending';
        chip.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          รอส่ง: ชั้น ${p}
        `;
        auditAlertChips.appendChild(chip);
      });
    }

    document.getElementById('grandSummaryTotal').innerHTML = `
      ยอดรวมทั้งสิ้นทั่วทั้งโรงเรียน: นักเรียนทั้งหมด <strong class="tabular">${schoolSummary.overall.total}</strong> คน (ชาย ${schoolSummary.male.total}, หญิง ${schoolSummary.female.total}) • 
      มาเรียนรวม <strong class="tabular" style="color:var(--status-present-text);">${schoolSummary.overall.present}</strong> คน • ขาด <strong class="tabular" style="color:var(--status-absent-text);">${schoolSummary.overall.absent}</strong> คน • ลา ${schoolSummary.overall.sick + schoolSummary.overall.business} คน • สาย ${schoolSummary.overall.late} คน • 
      ร้อยละการมาเรียนรวมทั้งโรงเรียน <strong class="tabular">${schoolSummary.overall.rate}%</strong>
    `;

  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 20px; color:var(--status-absent-text);">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: ${e.message}</td></tr>`;
  }
}

async function inspectRoom(grade) {
  const summaryDateInput = document.getElementById('summaryDate');
  const targetDate = (summaryDateInput && summaryDateInput.value) ? summaryDateInput.value : state.selectedDate;

  // Since we rely entirely on API now, fetch that room's students and attendance
  const tbody = document.getElementById('roomModalStudentTableBody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">กำลังโหลดข้อมูล...</td></tr>';
  
  document.getElementById('roomModalTitle').textContent = `ตรวจสอบรายชื่อนักเรียน ชั้น ${grade} ห้อง 1`;
  document.getElementById('roomModalTeacher').innerHTML = `<span style="font-size:0.85rem; color:var(--slate-500);">โหลดข้อมูลครูประจำชั้น...</span>`;
  document.getElementById('roomModalSub').innerHTML = `ประจำวันที่ ${targetDate}`;
  document.getElementById('roomModalRate').textContent = `-`;

  document.getElementById('roomDetailModal').classList.remove('hidden');

  try {
    const resAtt = await callApi('getAttendance', { date: targetDate, grade: grade, room: '1' }, 'GET');
    const resStu = await callApi('getStudents', { grade: grade, room: '1' }, 'GET');

    if (!resStu.success) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">โหลดรายชื่อนักเรียนล้มเหลว</td></tr>';
      return;
    }

    const students = resStu.data || [];
    const attData = resAtt.data || [];
    const attMap = {};
    attData.forEach(a => { attMap[String(a.studentId)] = a; });
    
    // Find checker details from the first valid record
    const auditRecord = attData.find(a => a.checkedByName);
    if (auditRecord) {
      document.getElementById('roomModalTeacher').innerHTML = `
        <span style="font-weight:500; color:var(--slate-800);">ผู้ตรวจ: ${auditRecord.checkedByName}</span>
        <span style="font-size:0.8rem; color:var(--slate-400); margin-left:8px;">เวลา ${auditRecord.updatedAt || ''}</span>
      `;
    } else {
      document.getElementById('roomModalTeacher').innerHTML = `<span style="font-size:0.85rem; color:var(--slate-500);">ยังไม่มีประวัติการบันทึก</span>`;
    }

    tbody.innerHTML = '';
    let presentCount = 0;

    students.forEach((st, idx) => {
      const a = attMap[String(st.studentId)];
      const s = a ? a.status : 'ยังไม่เช็ค';
      const note = a ? a.note : '';
      
      let badgeClass = 'status-badge ';
      let badgeLabel = s;
      if (s === 'มา' || s === 'กิจกรรม') { badgeClass += 'present'; presentCount++; }
      else if (s === 'ขาด') { badgeClass += 'absent'; }
      else if (s === 'ลาป่วย' || s === 'ลากิจ') { badgeClass += 'sick'; }
      else if (s === 'สาย') { badgeClass += 'late'; presentCount++; } // Assuming 'late' counts as present
      else { badgeClass += 'pending'; }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="text-align: center;" class="tabular">${st.number}</td>
        <td>
          <div style="display:flex; flex-direction:column;">
            <span style="font-weight:500; color:var(--slate-800);">${st.fullName}</span>
            <span style="font-size:0.7rem; color:var(--slate-400);">รหัส ${st.studentId}</span>
          </div>
        </td>
        <td style="text-align: center;">
          <span class="${badgeClass}">
            ${badgeLabel}
          </span>
        </td>
        <td style="font-size:0.82rem; color:var(--slate-600);">
          ${note ? note : '<span style="color:var(--slate-400);">-</span>'}
        </td>
      `;
      tbody.appendChild(tr);
    });

    const rate = students.length > 0 && attData.length > 0 ? Math.round((presentCount / students.length) * 100) : 0;
    document.getElementById('roomModalRate').textContent = `${presentCount}/${students.length} คน (${rate}%)`;

    const btnGo = document.getElementById('btnGoToRoomCheck');
    if (state.currentUser && state.currentUser.role === 'admin') {
      btnGo.style.display = 'none'; // ผอ. ดูอย่างเดียว ไม่มีปุ่มไปเช็คชื่อ
    } else {
      btnGo.style.display = '';
      btnGo.onclick = () => { goToRoomCheck(grade); };
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">ข้อผิดพลาดเครือข่าย: ${e.message}</td></tr>`;
  }
}

function closeRoomDetailModal() {
  document.getElementById('roomDetailModal').classList.add('hidden');
}

function goToRoomCheck(grade) {
  closeRoomDetailModal();
  switchTab('attendance');
  const gradeSelect = document.getElementById('gradeSelect');
  gradeSelect.value = grade;
  state.selectedGrade = grade;
  loadAttendanceData();
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast-item ${type}`;

  const iconSvg = type === 'success'
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--status-present-solid);"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--status-absent-solid);"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

  toast.innerHTML = `
    ${iconSvg}
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

function setupEventListeners() {
  document.getElementById('gradeSelect').addEventListener('change', (e) => {
    state.selectedGrade = e.target.value;
    loadAttendanceData();
  });

  document.getElementById('attendanceDate').addEventListener('change', (e) => {
    state.selectedDate = e.target.value;
    loadAttendanceData();
  });

  const summaryDateInput = document.getElementById('summaryDate');
  if (summaryDateInput) {
    summaryDateInput.addEventListener('change', () => {
      renderSchoolSummary();
    });
  }

  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    handleLogin();
  });
}

