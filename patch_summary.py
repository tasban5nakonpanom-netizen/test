import re

with open('js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

start_sig = "function renderSchoolSummary() {"
end_sig = "function closeRoomDetailModal() {"

start_idx = content.find(start_sig)
end_idx = content.find(end_sig)

new_functions = """
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
  const tbody = document.getElementById('roomDetailTableBody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">กำลังโหลดข้อมูล...</td></tr>';
  
  document.getElementById('roomModalTitle').textContent = `ตรวจสอบรายชื่อนักเรียน ชั้น ${grade} ห้อง 1`;
  document.getElementById('roomModalTeacher').innerHTML = `<span style="font-size:0.85rem; color:var(--slate-500);">โหลดข้อมูลครูประจำชั้น...</span>`;
  document.getElementById('roomModalMeta').innerHTML = `ประจำวันที่ ${targetDate}`;
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
    btnGo.onclick = () => { goToRoomCheck(grade); };
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">ข้อผิดพลาดเครือข่าย: ${e.message}</td></tr>`;
  }
}

"""

new_content = content[:start_idx] + new_functions + content[end_idx:]

with open('js/app.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

