/**
 * ==============================================================================
 * 🏫 ระบบบริหารจัดการการมาเรียนของนักเรียนทั้งโรงเรียน (Smart School Attendance System)
 * Google Apps Script Backend (RESTful Web App API & Sheet Database Engine)
 * ==============================================================================
 * 
 * 📌 คุณสมบัติเด่นของระบบ:
 * 1. ระบบยืนยันตัวตนแยกสิทธิ์ 3 ระดับ (Role-Based Access Control):
 *    - 'teacher'    : ครูประจำชั้น (เห็นและจัดการได้เฉพาะชั้น/ห้องของตนเอง)
 *    - 'head_grade' : หัวหน้าสายชั้น (ดูสรุปและตรวจสอบทุกห้องในสายชั้น เช่น ดู ป.1 ได้ทุกห้อง)
 *    - 'admin'      : ผู้บริหาร/ฝ่ายปกครอง/ฝ่ายวิชาการ (ดูและจัดการได้ทั้งโรงเรียน)
 * 2. บันทึกและวิเคราะห์ข้อมูลนักเรียนแบบละเอียด:
 *    - รหัสนักเรียน, เลขประจำตัวประชาชน, คำนำหน้า, ชื่อ, นามสกุล, ชื่อเล่น, เพศ (ชาย/หญิง)
 *    - ระดับชั้น, ห้อง, เลขที่, สถานะนักเรียน (ปกติ/พักการเรียน/ย้าย), เบอร์โทรผู้ปกครอง
 * 3. บันทึกสถานะการมาเรียนได้ 6 สถานะ:
 *    - 'มา' (Present), 'ขาด' (Absent), 'ลาป่วย' (Sick), 'ลากิจ' (Personal), 'สาย' (Late), 'กิจกรรม' (Activity)
 *    - พร้อมบันทึกเหตุผล, รายละเอียดการลา, เวลาที่มาถึง (กรณีมาสาย)
 * 4. สรุปสถิติ ชาย-หญิง แบบเจาะลึก (Real-time Analytics):
 *    - สรุปรายห้อง: ชายมา/ขาด/ลา/สาย/กิจกรรม, หญิงมา/ขาด/ลา/สาย/กิจกรรม, คิดอัตรา % การมาเรียน
 *    - สรุปทั้งโรงเรียน: แยกภาพรวม, แยกตามสายชั้น, ตรวจสอบห้องที่ "ยังไม่ได้เช็คชื่อ" (Pending Classes)
 *    - รายชื่อนักเรียนขาดเรียนสะสม (At-Risk Students Watchlist) สำหรับฝ่ายปกครอง
 * 5. ป้องกันข้อมูลซ้ำซ้อนด้วยระบบ Smart Upsert (อัปเดตข้อมูลอัตโนมัติหากมีการเช็คซ้ำในวันเดียวกัน)
 * 6. รองรับการแจ้งเตือนสรุปผ่าน LINE Notify (หากใส่ Token)
 * 
 * 📌 คำแนะนำการติดตั้ง:
 * 1. เปิด Google Sheets เปล่า 1 ไฟล์
 * 2. ไปที่เมนู "ส่วนขยาย" (Extensions) > "Apps Script"
 * 3. วางโค้ดนี้ลงไป แล้วเลือกฟังก์ชัน `initialSetup` กด "เรียกใช้" (Run)
 * 4. กด "Deploy" (การทำให้ใช้งานได้) > "New deployment" > เลือก "Web App"
 *    - Execute as : Me (ฉัน)
 *    - Access     : Anyone (ทุกคน) *** จำเป็นมาก ***
 * 5. นำ Web App URL ที่ได้ไปเชื่อมต่อกับ Frontend
 */

// ==============================================================================
// ⚙️ 1. CONSTANTS & SYSTEM CONFIGURATION
// ==============================================================================

/**
 * 💡 หากคุณสร้างสคริปต์นี้จากภายใน Google Sheets โดยตรง (ส่วนขยาย > Apps Script) 
 * -> ปล่อย SPREADSHEET_ID ว่างไว้ได้เลย ระบบจะตรวจจับชีตให้อัตโนมัติ!
 * 
 * 💡 แต่หากคุณสร้างโปรเจกต์แยกที่ script.google.com (Standalone Script):
 * -> ให้ก๊อปปี้ URL หรือ Spreadsheet ID ของ Google Sheets มาวางในช่องนี้
 *    หรือถ้าปล่อยว่างไว้ ระบบจะสร้างไฟล์ Google Sheets ให้ใหม่ใน Google Drive ของคุณทันที!
 */
const SPREADSHEET_ID = '13RmJB95-21AHfuAFa1hvNwdouAT584UIaHmeE5DNqVs'; 

const SHEET_NAMES = {
  TEACHERS: 'teachers',
  STUDENTS: 'students',
  ATTENDANCE: 'attendance',
  SETTINGS: 'settings',
  LOGS: 'audit_logs'
};

const ATTENDANCE_STATUS = {
  PRESENT: 'มา',
  ABSENT: 'ขาด',
  SICK_LEAVE: 'ลาป่วย',
  BUSINESS_LEAVE: 'ลากิจ',
  LATE: 'สาย',
  ACTIVITY: 'กิจกรรม',
  UNCHECKED: 'ยังไม่เช็ค'
};

const USER_ROLES = {
  ADMIN: 'admin',
  HEAD_GRADE: 'head_grade',
  TEACHER: 'teacher'
};

// ==============================================================================
// 🛠️ 2. INITIAL SETUP & MOCK DATA GENERATOR
// ==============================================================================
/**
 * รันฟังก์ชันนี้ครั้งแรกเพื่อสร้าง Sheet ทั้งหมด พร้อมหัวตารางและข้อมูลตัวอย่างแบบสมบูรณ์
 */
function initialSetup() {
  const ss = getSpreadsheet();

  // -------------------------------------------------------------
  // 1. ชีต teachers (ข้อมูลครูและผู้ดูแลระบบ)
  // -------------------------------------------------------------
  let teacherSheet = getOrCreateSheet(ss, SHEET_NAMES.TEACHERS);
  teacherSheet.clear();
  teacherSheet.appendRow([
    'username', 'password', 'name', 'position', 'grade', 'room', 'role', 'phone', 'email', 'status'
  ]);
  formatHeaderRow(teacherSheet, 10);

  const sampleTeachers = [
    ['admin', '1234', 'ผู้ดูแลระบบ', 'ผู้อำนวยการ', 'ทั้งหมด', '1', USER_ROLES.ADMIN, '0812345678', 'admin@school.ac.th', 'active'],
    ['kru_a1', '1234', 'ครูสมใจ รักเด็ก', 'ครูประจำชั้น อ.1', 'อ.1', '1', USER_ROLES.TEACHER, '0897777777', 'a1@school.ac.th', 'active'],
    ['kru_a2', '1234', 'ครูปราณี ดีงาม', 'ครูประจำชั้น อ.2', 'อ.2', '1', USER_ROLES.TEACHER, '0898888888', 'a2@school.ac.th', 'active'],
    ['kru_a3', '1234', 'ครูจันทร์เพ็ญ เด่นดวง', 'ครูประจำชั้น อ.3', 'อ.3', '1', USER_ROLES.TEACHER, '0899999999', 'a3@school.ac.th', 'active'],
    ['kru_p1', '1234', 'ครูสมศรี ใจดี', 'ครูประจำชั้น ป.1', 'ป.1', '1', USER_ROLES.TEACHER, '0891111111', 'p1@school.ac.th', 'active'],
    ['kru_p2', '1234', 'ครูวิไล รักเรียน', 'ครูประจำชั้น ป.2', 'ป.2', '1', USER_ROLES.TEACHER, '0892222222', 'p2@school.ac.th', 'active'],
    ['kru_p3', '1234', 'ครูสมศักดิ์ กล้าหาญ', 'ครูประจำชั้น ป.3', 'ป.3', '1', USER_ROLES.TEACHER, '0893333333', 'p3@school.ac.th', 'active'],
    ['kru_p4', '1234', 'ครูกมลวรรณ ทวีทรัพย์', 'ครูประจำชั้น ป.4', 'ป.4', '1', USER_ROLES.TEACHER, '0894444444', 'p4@school.ac.th', 'active'],
    ['kru_p5', '1234', 'ครูเอกชัย พัฒนวงศ์', 'ครูประจำชั้น ป.5', 'ป.5', '1', USER_ROLES.TEACHER, '0895555555', 'p5@school.ac.th', 'active'],
    ['kru_p6', '1234', 'ครูวีระยุทธ ยิ่งยง', 'ครูประจำชั้น ป.6', 'ป.6', '1', USER_ROLES.TEACHER, '0896666666', 'p6@school.ac.th', 'active']
  ];
  sampleTeachers.forEach(row => teacherSheet.appendRow(row));

  // -------------------------------------------------------------
  // 2. ชีต students (ใส่รายชื่อนักเรียนจริง 95 คน จากไฟล์ Excel ป.1 - ป.6)
  // -------------------------------------------------------------
  let studentSheet = getOrCreateSheet(ss, SHEET_NAMES.STUDENTS);
  studentSheet.clear();
  studentSheet.appendRow([
    'studentId', 'nationalId', 'prefix', 'firstName', 'lastName', 'nickname',
    'gender', 'grade', 'room', 'number', 'status', 'parentName', 'parentPhone', 'address', 'medicalNote'
  ]);
  formatHeaderRow(studentSheet, 15);

    const realStudents = [
    ["1654", "", "เด็กชาย", "วุฒิชาติ", "สุขพันธ์อ่ำ", "", "ชาย", "อ.1", "1", 1, "ปกติ", "", "", "", ""],
    ["1660", "", "เด็กชาย", "ธนโชติ", "มาเรียน", "", "ชาย", "อ.1", "1", 2, "ปกติ", "", "", "", ""],
    ["1661", "", "เด็กชาย", "อคินรภัทร", "สร้อยคำ", "", "ชาย", "อ.1", "1", 3, "ปกติ", "", "", "", ""],
    ["1662", "", "เด็กหญิง", "พรรณณัฎฎา", "สนิมค้ำ", "", "หญิง", "อ.1", "1", 4, "ปกติ", "", "", "", ""],
    ["1655", "", "เด็กหญิง", "นิรดา", "ทองโกฎิ", "", "หญิง", "อ.1", "1", 5, "ปกติ", "", "", "", ""],
    ["1663", "", "เด็กหญิง", "ไอยวรินทร์", "สำราญทรัพย์", "", "หญิง", "อ.1", "1", 6, "ปกติ", "", "", "", ""],
    ["1664", "", "เด็กหญิง", "ปุณยาพร", "พรมดี", "", "หญิง", "อ.1", "1", 7, "ปกติ", "", "", "", ""],
    ["1665", "", "เด็กหญิง", "เพลินพิชญา", "ขาวพล", "", "หญิง", "อ.1", "1", 8, "ปกติ", "", "", "", ""],
    ["1666", "", "เด็กหญิง", "ฉันท์ชนก", "ศุภกูล", "", "หญิง", "อ.1", "1", 9, "ปกติ", "", "", "", ""],
    ["1667", "", "เด็กหญิง", "อนัญพร", "สุวรรณสาธ", "", "หญิง", "อ.1", "1", 10, "ปกติ", "", "", "", ""],
    ["1668", "", "เด็กหญิง", "ธีร์ติกา", "อาสาเนย์", "", "หญิง", "อ.1", "1", 11, "ปกติ", "", "", "", ""],
    ["1617", "", "เด็กชาย", "ปภาวิชญ์", "คำมงคล", "", "ชาย", "อ.2", "1", 1, "ปกติ", "", "", "", ""],
    ["1641", "", "เด็กชาย", "ฐิติพงศ์", "คอนซ้าย", "", "ชาย", "อ.2", "1", 2, "ปกติ", "", "", "", ""],
    ["1642", "", "เด็กชาย", "ชัยชนะ", "พลเยี่ยม", "", "ชาย", "อ.2", "1", 3, "ปกติ", "", "", "", ""],
    ["1625", "", "เด็กหญิง", "ณัฐพัชร์", "ปุยฝ้าย", "", "หญิง", "อ.2", "1", 4, "ปกติ", "", "", "", ""],
    ["1645", "", "เด็กหญิง", "ธัญญ์วรัศม์", "เนื่องจำนงค์", "", "หญิง", "อ.2", "1", 5, "ปกติ", "", "", "", ""],
    ["1646", "", "เด็กหญิง", "ธัญญรัตน์", "กาสีวงค์", "", "หญิง", "อ.2", "1", 6, "ปกติ", "", "", "", ""],
    ["1647", "", "เด็กหญิง", "ธิญาดา", "จันทร์ไตรรัตน์", "", "หญิง", "อ.2", "1", 7, "ปกติ", "", "", "", ""],
    ["1649", "", "เด็กหญิง", "วรัญญา", "ลีคำ", "", "หญิง", "อ.2", "1", 8, "ปกติ", "", "", "", ""],
    ["1585", "", "เด็กชาย", "ชนะวิญช์", "เพ็ชรวงษ์", "", "ชาย", "อ.3", "1", 1, "ปกติ", "", "", "", ""],
    ["1619", "", "เด็กชาย", "ภานพ", "พานทอง", "", "ชาย", "อ.3", "1", 2, "ปกติ", "", "", "", ""],
    ["1640", "", "เด็กชาย", "วีรพล", "ชัยภูธร", "", "ชาย", "อ.3", "1", 3, "ปกติ", "", "", "", ""],
    ["1621", "", "เด็กหญิง", "นริสรา", "ทิศทา", "", "หญิง", "อ.3", "1", 4, "ปกติ", "", "", "", ""],
    ["1622", "", "เด็กหญิง", "นาราภัทร", "เขื่อนเพชร", "", "หญิง", "อ.3", "1", 5, "ปกติ", "", "", "", ""],
    ["1624", "", "เด็กหญิง", "พรรณวรท", "บุญสืบ", "", "หญิง", "อ.3", "1", 6, "ปกติ", "", "", "", ""],
    ["1651", "", "เด็กชาย", "ธีรวิชญ์", "มีศิลป์", "", "ชาย", "อ.3", "1", 7, "ปกติ", "", "", "", ""],
    ["1658", "", "เด็กชาย", "วิชญกรณ์", "สีทองทา", "", "ชาย", "อ.3", "1", 8, "ปกติ", "", "", "", ""],
    ["1669", "", "เด็กชาย", "ศตวุฒิ", "ศุภกูล", "", "ชาย", "อ.3", "1", 9, "ปกติ", "", "", "", ""],
    ["1584", "1489900889643", "เด็กชาย", "ฉัตรชัย", "มณีโชติ", "", "ชาย", "ป.1", "1", 1, "ปกติ", "", "", "", ""],
    ["1587", "", "เด็กชาย", "พาทิศ", "ศรีพันธ์", "", "ชาย", "ป.1", "1", 2, "ปกติ", "", "", "", ""],
    ["1589", "", "เด็กชาย", "ธนันดร", "รัตนงาม", "", "ชาย", "ป.1", "1", 3, "ปกติ", "", "", "", ""],
    ["1592", "", "เด็กชาย", "อคิราห์", "สุวรรณสาร", "", "ชาย", "ป.1", "1", 4, "ปกติ", "", "", "", ""],
    ["1607", "", "เด็กชาย", "พีรพัฒน์", "คำผง", "", "ชาย", "ป.1", "1", 5, "ปกติ", "", "", "", ""],
    ["1616", "", "เด็กชาย", "วรปรัชญ์", "วงค์กาฬสินธุ์", "", "ชาย", "ป.1", "1", 6, "ปกติ", "", "", "", ""],
    ["1548", "", "เด็กหญิง", "นพมณี", "พ่อบำรุง", "", "หญิง", "ป.1", "1", 7, "ปกติ", "", "", "", ""],
    ["1590", "", "เด็กหญิง", "กนกกาญจน์", "เกศสุระ", "", "หญิง", "ป.1", "1", 8, "ปกติ", "", "", "", ""],
    ["1591", "", "เด็กหญิง", "กมลณัท", "สิงห์แดง", "", "หญิง", "ป.1", "1", 9, "ปกติ", "", "", "", ""],
    ["1592", "", "เด็กหญิง", "ชนณนก", "เชียงที", "", "หญิง", "ป.1", "1", 10, "ปกติ", "", "", "", ""],
    ["1594", "", "เด็กหญิง", "มาริสา", "บุญยะรักษ์", "", "หญิง", "ป.1", "1", 11, "ปกติ", "", "", "", ""],
    ["1657", "", "เด็กชาย", "ศตคุณ", "ศุภกูล", "", "ชาย", "ป.1", "1", 12, "ปกติ", "", "", "", ""],
    ["1541", "", "เด็กชาย", "วชิรา", "มนอยู่พะเนา", "", "ชาย", "ป.2", "1", 1, "ปกติ", "", "", "", ""],
    ["1542", "", "เด็กชาย", "สกลวรรธน์", "เขื่อนเพชร", "", "ชาย", "ป.2", "1", 2, "ปกติ", "", "", "", ""],
    ["1545", "", "เด็กชาย", "อัครพล", "กุลสอนนาน", "", "ชาย", "ป.2", "1", 3, "ปกติ", "", "", "", ""],
    ["1559", "", "เด็กชาย", "ครัสพงศ์", "สีลาฟอง", "", "ชาย", "ป.2", "1", 4, "ปกติ", "", "", "", ""],
    ["1575", "", "เด็กชาย", "ไชยะลิน", "ไชยะจักร", "", "ชาย", "ป.2", "1", 5, "ปกติ", "", "", "", ""],
    ["1627", "", "เด็กชาย", "ภิสิทธิ์", "บูรณณัติ", "", "ชาย", "ป.2", "1", 6, "ปกติ", "", "", "", ""],
    ["1546", "", "เด็กหญิง", "กรกมล", "ชาวต่างหวาย", "", "หญิง", "ป.2", "1", 7, "ปกติ", "", "", "", ""],
    ["1553", "", "เด็กหญิง", "พุทธรักษ์", "จันทะวง", "", "หญิง", "ป.2", "1", 8, "ปกติ", "", "", "", ""],
    ["1600", "", "เด็กหญิง", "สุนิตา", "ทีมี", "", "หญิง", "ป.2", "1", 9, "ปกติ", "", "", "", ""],
    ["1581", "", "เด็กหญิง", "ชิตาภัทร", "อาป้อง", "", "หญิง", "ป.2", "1", 10, "ปกติ", "", "", "", ""],
    ["1582", "", "เด็กหญิง", "แพรไพลิน", "สีสมโพชน์", "", "หญิง", "ป.2", "1", 11, "ปกติ", "", "", "", ""],
    ["1606", "", "เด็กหญิง", "ปรีญาภรณ์", "สุริรมย์", "", "หญิง", "ป.2", "1", 12, "ปกติ", "", "", "", ""],
    ["1653", "", "เด็กหญิง", "อลิษสา", "แก้วทาวง", "", "หญิง", "ป.2", "1", 13, "ปกติ", "", "", "", ""],
    ["1656", "", "เด็กชาย", "พิชญกรณ์", "สีทองทา", "", "ชาย", "ป.2", "1", 14, "ปกติ", "", "", "", ""],
    ["1508", "", "เด็กชาย", "กวีวัฒน์", "ถีสูงเนิน", "", "ชาย", "ป.3", "1", 1, "ปกติ", "", "", "", ""],
    ["1510", "", "เด็กชาย", "ณัฐชนน", "ถาวร", "", "ชาย", "ป.3", "1", 2, "ปกติ", "", "", "", ""],
    ["1511", "", "เด็กชาย", "ธีรเดช", "นิยมโภค", "", "ชาย", "ป.3", "1", 3, "ปกติ", "", "", "", ""],
    ["1516", "", "เด็กชาย", "ไวภพ", "สิทธิโชติ", "", "ชาย", "ป.3", "1", 4, "ปกติ", "", "", "", ""],
    ["1535", "", "เด็กชาย", "สรรพมงคล", "มูลโคตร", "", "ชาย", "ป.3", "1", 5, "ปกติ", "", "", "", ""],
    ["1572", "", "เด็กชาย", "พีรธัช", "นนดารา", "", "ชาย", "ป.3", "1", 6, "ปกติ", "", "", "", ""],
    ["1520", "", "เด็กหญิง", "เกวลิน", "วงษ์ไชยเสน", "", "หญิง", "ป.3", "1", 7, "ปกติ", "", "", "", ""],
    ["1521", "", "เด็กหญิง", "จุฑารัตน์", "ใจเอื้อ", "", "หญิง", "ป.3", "1", 8, "ปกติ", "", "", "", ""],
    ["1525", "", "เด็กหญิง", "ปวิชญา", "จิตประมูล", "", "หญิง", "ป.3", "1", 9, "ปกติ", "", "", "", ""],
    ["1639", "", "เด็กหญิง", "กันยา", "วิไลดี", "", "หญิง", "ป.3", "1", 10, "ปกติ", "", "", "", ""],
    ["1517", "", "เด็กชาย", "อติเทพ", "นครวงค์", "", "ชาย", "ป.3", "1", 11, "ปกติ", "", "", "", ""],
    ["1603", "", "เด็กหญิง", "กัญญาภัค", "เกตุแก้ว", "", "หญิง", "ป.3", "1", 12, "ปกติ", "", "", "", ""],
    ["1605", "", "เด็กหญิง", "เกวลิน", "เพ็งพรม", "", "หญิง", "ป.3", "1", 13, "ปกติ", "", "", "", ""],
    ["1608", "", "เด็กหญิง", "พรรษชล", "แสนทวีสุข", "", "หญิง", "ป.3", "1", 14, "ปกติ", "", "", "", ""],
    ["1469", "", "เด็กชาย", "คณาธิป", "สีสงค์", "", "ชาย", "ป.4", "1", 1, "ปกติ", "", "", "", ""],
    ["1471", "", "เด็กชาย", "ณัฐกรณ์", "ประทุมทอง", "", "ชาย", "ป.4", "1", 2, "ปกติ", "", "", "", ""],
    ["1473", "", "เด็กชาย", "พิภัช", "บางพรมบาง", "", "ชาย", "ป.4", "1", 3, "ปกติ", "", "", "", ""],
    ["1474", "", "เด็กชาย", "ภาคภูมิ", "บัณฑิต", "", "ชาย", "ป.4", "1", 4, "ปกติ", "", "", "", ""],
    ["1558", "", "เด็กชาย", "ชัยวัทน์", "โนนศรีเมือง", "", "ชาย", "ป.4", "1", 5, "ปกติ", "", "", "", ""],
    ["1579", "", "เด็กชาย", "ณพิชญ์", "ชาวต่างหวาย", "", "ชาย", "ป.4", "1", 6, "ปกติ", "", "", "", ""],
    ["1580", "", "เด็กชาย", "นราวิชญ์", "คำสะท้อน", "", "ชาย", "ป.4", "1", 7, "ปกติ", "", "", "", ""],
    ["1604", "", "เด็กชาย", "ณัฐวุฒิ", "คำผง", "", "ชาย", "ป.4", "1", 8, "ปกติ", "", "", "", ""],
    ["1613", "", "เด็กชาย", "ณัฐชพล", "เทียมทะนงค์", "", "ชาย", "ป.4", "1", 9, "ปกติ", "", "", "", ""],
    ["1614", "", "เด็กชาย", "แป๊ปซี่", "คำกอง", "", "ชาย", "ป.4", "1", 10, "ปกติ", "", "", "", ""],
    ["1478", "", "เด็กหญิง", "ณิชากรณ์", "คำสุข", "", "หญิง", "ป.4", "1", 11, "ปกติ", "", "", "", ""],
    ["1480", "", "เด็กหญิง", "ปัญญาวี", "สุนทรา", "", "หญิง", "ป.4", "1", 12, "ปกติ", "", "", "", ""],
    ["1482", "", "เด็กหญิง", "พัณณิตา", "ศิริสวัสดิ์", "", "หญิง", "ป.4", "1", 13, "ปกติ", "", "", "", ""],
    ["1483", "", "เด็กหญิง", "พิมพกานต์", "วงษ์ภา", "", "หญิง", "ป.4", "1", 14, "ปกติ", "", "", "", ""],
    ["1484", "", "เด็กหญิง", "ศุภานิชญ์", "ดอกไม้", "", "หญิง", "ป.4", "1", 15, "ปกติ", "", "", "", ""],
    ["1487", "", "เด็กหญิง", "อรปรียา", "บุญยะรักษ์", "", "หญิง", "ป.4", "1", 16, "ปกติ", "", "", "", ""],
    ["1652", "", "เด็กชาย", "ศุภวิชญ์", "วงค์ณคร", "", "ชาย", "ป.4", "1", 17, "ปกติ", "", "", "", ""],
    ["1633", "", "เด็กชาย", "ธนพล", "ศุภกูล", "", "ชาย", "ป.5", "1", 1, "ปกติ", "", "", "", ""],
    ["1427", "", "เด็กชาย", "กิติภพ", "บานอินทร์", "", "ชาย", "ป.5", "1", 2, "ปกติ", "", "", "", ""],
    ["1450", "", "เด็กชาย", "จิรายุ", "เทพวงศ์ษา", "", "ชาย", "ป.5", "1", 3, "ปกติ", "", "", "", ""],
    ["1453", "", "เด็กชาย", "ธัญญเทพ", "แก้วเครือวัลย์", "", "ชาย", "ป.5", "1", 4, "ปกติ", "", "", "", ""],
    ["1456", "", "เด็กชาย", "บัญญพนต์", "ลาแก้ว", "", "ชาย", "ป.5", "1", 5, "ปกติ", "", "", "", ""],
    ["1458", "", "เด็กชาย", "กิตติน์ฉัตร", "ปานลักษณ์พล", "", "ชาย", "ป.5", "1", 6, "ปกติ", "", "", "", ""],
    ["1459", "", "เด็กชาย", "วิวัฒน์ชัย", "พ่อกว้าง", "", "ชาย", "ป.5", "1", 7, "ปกติ", "", "", "", ""],
    ["1461", "", "เด็กชาย", "ชนานน", "เชียงที", "", "ชาย", "ป.5", "1", 8, "ปกติ", "", "", "", ""],
    ["1534", "", "เด็กชาย", "สุรชัช", "ศรีพระจันทร์", "", "ชาย", "ป.5", "1", 9, "ปกติ", "", "", "", ""],
    ["1449", "", "เด็กหญิง", "กัญญาพัชร", "สรรพโส", "", "หญิง", "ป.5", "1", 10, "ปกติ", "", "", "", ""],
    ["1462", "", "เด็กหญิง", "ณัชชา", "นิยมโภค", "", "หญิง", "ป.5", "1", 11, "ปกติ", "", "", "", ""],
    ["1463", "", "เด็กหญิง", "นิชาภรณ์", "กาสำโรง", "", "หญิง", "ป.5", "1", 12, "ปกติ", "", "", "", ""],
    ["1464", "", "เด็กหญิง", "ปวริศา", "สุนทรา", "", "หญิง", "ป.5", "1", 13, "ปกติ", "", "", "", ""],
    ["1465", "", "เด็กหญิง", "อาริยา", "คำงาม", "", "หญิง", "ป.5", "1", 14, "ปกติ", "", "", "", ""],
    ["1467", "", "เด็กหญิง", "ไอลดา", "ภูชุม", "", "หญิง", "ป.5", "1", 15, "ปกติ", "", "", "", ""],
    ["1428", "", "เด็กชาย", "ณัฐชาติ", "ทองทา", "", "ชาย", "ป.6", "1", 1, "ปกติ", "", "", "", ""],
    ["1431", "", "เด็กชาย", "บุลวัชร", "ทุมประเสน", "", "ชาย", "ป.6", "1", 2, "ปกติ", "", "", "", ""],
    ["1432", "", "เด็กชาย", "พงศกร", "วงษ์ภา", "", "ชาย", "ป.6", "1", 3, "ปกติ", "", "", "", ""],
    ["1433", "", "เด็กชาย", "พิชญดนย์", "หาวัง", "", "ชาย", "ป.6", "1", 4, "ปกติ", "", "", "", ""],
    ["1434", "", "เด็กชาย", "อภิเชษฐ์", "หน่อแก้ว", "", "ชาย", "ป.6", "1", 5, "ปกติ", "", "", "", ""],
    ["1435", "", "เด็กชาย", "อิทธิพัทธ์", "เนียมเปีย", "", "ชาย", "ป.6", "1", 6, "ปกติ", "", "", "", ""],
    ["1437", "", "เด็กชาย", "ปุณยวัจน์", "แก้วอุดรธัญวงศ์", "", "ชาย", "ป.6", "1", 7, "ปกติ", "", "", "", ""],
    ["1438", "", "เด็กชาย", "ประวันวิทย์", "สิงห์มอญ", "", "ชาย", "ป.6", "1", 8, "ปกติ", "", "", "", ""],
    ["1439", "", "เด็กชาย", "ชนะชัย", "บุญปก", "", "ชาย", "ป.6", "1", 9, "ปกติ", "", "", "", ""],
    ["1492", "", "เด็กชาย", "พรชัย", "ลาดษะวง", "", "ชาย", "ป.6", "1", 10, "ปกติ", "", "", "", ""],
    ["1495", "", "เด็กชาย", "คฑาวุติ", "อ้นทอง", "", "ชาย", "ป.6", "1", 11, "ปกติ", "", "", "", ""],
    ["1636", "", "เด็กชาย", "ภัทรพงษ์", "โพธิ์ทอง", "", "ชาย", "ป.6", "1", 12, "ปกติ", "", "", "", ""],
    ["1637", "", "เด็กชาย", "ยศวรรธน์", "เวฬุวนารักษ์", "", "ชาย", "ป.6", "1", 13, "ปกติ", "", "", "", ""],
    ["1429", "", "เด็กชาย", "ณฐวัฒน์", "ศรียะวงษ์", "", "ชาย", "ป.6", "1", 14, "ปกติ", "", "", "", ""],
    ["1441", "", "เด็กหญิง", "นันทิชา", "ไชยงาม", "", "หญิง", "ป.6", "1", 15, "ปกติ", "", "", "", ""],
    ["1442", "", "เด็กหญิง", "กาญจนา", "กรอดสุย", "", "หญิง", "ป.6", "1", 16, "ปกติ", "", "", "", ""],
    ["1444", "", "เด็กหญิง", "ปวีณา", "ศรีบุตรชิน", "", "หญิง", "ป.6", "1", 17, "ปกติ", "", "", "", ""],
    ["1446", "", "เด็กหญิง", "พิชญ์สินี", "ศรีพันธ์", "", "หญิง", "ป.6", "1", 18, "ปกติ", "", "", "", ""],
    ["1447", "", "เด็กหญิง", "แพรวพราว", "เมืองจันทร์", "", "หญิง", "ป.6", "1", 19, "ปกติ", "", "", "", ""],
    ["1569", "", "เด็กหญิง", "ณิชาภัทร", "ประยาว", "", "หญิง", "ป.6", "1", 20, "ปกติ", "", "", "", ""],
    ["1644", "", "เด็กหญิง", "สิรินภา", "คนฉลาด", "", "หญิง", "ป.6", "1", 21, "ปกติ", "", "", "", ""]
  ];

  if (realStudents.length > 0) {
    studentSheet.getRange(2, 1, realStudents.length, realStudents[0].length).setValues(realStudents);
  }

  // -------------------------------------------------------------
  // 3. ชีต attendance (สร้างหัวตารางไว้ ระบบจะบันทึกให้อัตโนมัติเมื่อเช็คชื่อ)
  // -------------------------------------------------------------
  let attSheet = getOrCreateSheet(ss, SHEET_NAMES.ATTENDANCE);
  attSheet.clear();
  attSheet.appendRow([
    'date', 'studentId', 'prefix', 'firstName', 'lastName', 'nickname',
    'gender', 'grade', 'room', 'number', 'status', 'arrivalTime',
    'note', 'checkedBy', 'checkedByName', 'updatedAt'
  ]);
  formatHeaderRow(attSheet, 16);

  // -------------------------------------------------------------
  // 4. ชีต settings (การตั้งค่าทั่วไปของโรงเรียน)
  // -------------------------------------------------------------
  let setSheet = getOrCreateSheet(ss, SHEET_NAMES.SETTINGS);
  setSheet.clear();
  setSheet.appendRow(['key', 'value', 'description']);
  formatHeaderRow(setSheet, 3);

  const defaultSettings = [
    ['school_name', 'โรงเรียนเทศบาล ๕ (สมพรอภัยโส)', 'ชื่อโรงเรียนสำหรับแสดงบนหัวเว็บ'],
    ['academic_year', '2569', 'ปีการศึกษาปัจจุบัน'],
    ['semester', '1', 'ภาคเรียนปัจจุบัน'],
    ['late_time_threshold', '08:00', 'เวลาสาย (หลังเวลานี้ถือว่ามาสาย)']
  ];
  defaultSettings.forEach(row => setSheet.appendRow(row));

  // -------------------------------------------------------------
  // 5. ชีต audit_logs
  // -------------------------------------------------------------
  let logSheet = getOrCreateSheet(ss, SHEET_NAMES.LOGS);
  logSheet.clear();
  logSheet.appendRow(['timestamp', 'username', 'action', 'details', 'status']);
  formatHeaderRow(logSheet, 5);

  const setupSummary = 
    '✅ สร้างชีตเรียบร้อย!\n' +
    '📄 URL: ' + ss.getUrl() + '\n\n' +
    '📌 บัญชีทดสอบ (รหัสผ่าน 1234 ทุกบัญชี):\n' +
    '• admin (ผู้บริหาร - เห็นทุกชั้น)\n' +
    '• kru_p1 ถึง kru_p6 (ครูประจำชั้น ป.1 - ป.6)\n\n' +
    '📝 ขั้นตอนต่อไป: เพิ่มรายชื่อนักเรียนในชีต students';

  Logger.log(setupSummary);

  try {
    SpreadsheetApp.getUi().alert(setupSummary);
  } catch(uiErr) {}

  return {
    success: true,
    message: 'สร้างและตั้งค่าชีตทั้งหมด 5 ชีต พร้อมรายชื่อนักเรียนจริง 95 คน และบัญชีครูเรียบร้อยแล้ว',
    spreadsheetUrl: ss.getUrl(),
    spreadsheetId: ss.getId(),
    studentsCount: realStudents.length,
    teachersCount: sampleTeachers.length
  };
}

// ==============================================================================
// 🌐 3. REQUEST ROUTER & API CONTROLLER
// ==============================================================================

function doGet(e) {
  return handleApiRequest(e);
}

function doPost(e) {
  return handleApiRequest(e);
}

function handleApiRequest(e) {
  let params = {};
  
  if (e && e.parameter && Object.keys(e.parameter).length > 0) {
    params = Object.assign({}, e.parameter);
  }
  
  if (e && e.postData && e.postData.contents) {
    try {
      const parsedBody = JSON.parse(e.postData.contents);
      params = Object.assign({}, params, parsedBody);
    } catch (parseErr) {
      // Body อาจเป็น url-encoded หรือ text
    }
  }

  const action = params.action;
  let response = { success: false, timestamp: new Date().toISOString() };

  try {
    switch (action) {
      // 0. ติดตั้งและเตรียมฐานข้อมูลครั้งแรก
      case 'initialSetup':
      case 'setup':
        response = initialSetup();
        break;

      // 1. ยืนยันตัวตน
      case 'login':
        response = apiLogin(params.username, params.password);
        break;

      // 2. ข้อมูลนักเรียน
      case 'getStudents':
        response = apiGetStudents(params);
        break;
      
      case 'getStudentById':
        response = apiGetStudentById(params.studentId);
        break;

      // 3. การเช็คชื่อ
      case 'getAttendance':
        response = apiGetAttendance(params);
        break;

      case 'saveAttendance':
        response = apiSaveAttendance(params);
        break;

      // 4. สรุปสถิติ & Dashboard
      case 'getRoomDailySummary':
        response = apiGetRoomDailySummary(params);
        break;

      case 'getSchoolDailySummary':
        response = apiGetSchoolDailySummary(params);
        break;

      case 'getStudentAttendanceHistory':
        response = apiGetStudentAttendanceHistory(params);
        break;

      case 'getAbsenceWatchlist':
        response = apiGetAbsenceWatchlist(params);
        break;

      // 5. ตัวเลือก Dropdown & การตั้งค่า
      case 'getSchoolStructure':
        response = apiGetSchoolStructure();
        break;

      case 'getSchoolSettings':
        response = apiGetSchoolSettings();
        break;

      // 6. การจัดการข้อมูล (CRUD สำหรับ Admin)
      case 'saveStudent':
        response = apiSaveStudent(params);
        break;

      case 'saveTeacher':
        response = apiSaveTeacher(params);
        break;

      default:
        response = {
          success: false,
          message: 'ไม่พบฟังก์ชัน (Action) ที่ระบุ: ' + (action || 'undefined')
        };
        break;
    }
  } catch (err) {
    response = {
      success: false,
      message: 'ข้อผิดพลาดภายในระบบ: ' + err.toString(),
      stack: err.stack
    };
    logActivity('SYSTEM_ERROR', 'Action: ' + action + ' Error: ' + err.toString(), 'ERROR');
  }

  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==============================================================================
// 🔐 4. AUTHENTICATION & ACCESS CONTROL
// ==============================================================================

function apiLogin(username, password) {
  if (!username || !password) {
    return { success: false, message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน' };
  }

  const sheet = getSheetByName(SHEET_NAMES.TEACHERS);
  let rows = getSheetDataAsObjects(sheet);

  // 💡 AUTO-HEAL: หากยังไม่มีข้อมูลครู ให้ทำการ initialSetup อัตโนมัติทันที
  if (rows.length === 0) {
    try {
      initialSetup();
      rows = getSheetDataAsObjects(sheet);
    } catch(e) {
      Logger.log('Auto-setup error: ' + e);
    }
  }

  const cleanUser = String(username).trim();
  const cleanPass = String(password).trim();

  const user = rows.find(r => 
    String(r.username).trim() === cleanUser && 
    String(r.password).trim() === cleanPass && 
    r.status !== 'inactive'
  );

  if (!user) {
    logActivity(cleanUser, 'LOGIN_FAILED', 'เข้าสู่ระบบไม่สำเร็จ (รหัสผ่านไม่ถูกต้อง หรือชื่อผู้ใช้ไม่มีอยู่)', 'FAILED');
    return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชีถูกระงับ' };
  }

  logActivity(cleanUser, 'LOGIN_SUCCESS', `เข้าสู่ระบบสำเร็จ (Role: ${user.role}, Grade: ${user.grade}, Room: ${user.room})`, 'SUCCESS');

  return {
    success: true,
    message: 'เข้าสู่ระบบสำเร็จ',
    user: {
      username: user.username,
      name: user.name,
      position: user.position || '',
      grade: String(user.grade),
      room: String(user.room),
      role: user.role, // 'admin' | 'head_grade' | 'teacher'
      phone: user.phone || '',
      email: user.email || ''
    }
  };
}

// ==============================================================================
// 👨‍🎓 5. STUDENT DATA MANAGEMENT
// ==============================================================================

function apiGetStudents(params) {
  const grade = params.grade;
  const room = params.room;
  const statusFilter = params.status || 'ปกติ'; // ปกติ, ทั้งหมด

  const sheet = getSheetByName(SHEET_NAMES.STUDENTS);
  let rows = getSheetDataAsObjects(sheet);

  // 💡 AUTO-HEAL: หากยังไม่มีข้อมูลนักเรียน ให้ทำการ initialSetup อัตโนมัติทันที
  if (rows.length === 0) {
    try {
      initialSetup();
      rows = getSheetDataAsObjects(sheet);
    } catch(e) {
      Logger.log('Auto-setup error: ' + e);
    }
  }

  let filtered = rows.filter(s => {
    // กรองสถานะนักเรียน
    if (statusFilter !== 'ทั้งหมด' && s.status !== statusFilter) return false;
    // กรองระดับชั้น
    if (grade && grade !== 'ทั้งหมด' && String(s.grade) !== String(grade)) return false;
    // กรองห้อง
    if (room && room !== 'ทั้งหมด' && String(s.room) !== String(room)) return false;
    return true;
  });

  // เรียงลำดับ: ระดับชั้น -> ห้อง -> เลขที่
  filtered.sort((a, b) => {
    if (a.grade !== b.grade) return String(a.grade).localeCompare(String(b.grade));
    if (a.room !== b.room) return Number(a.room) - Number(b.room);
    return Number(a.number) - Number(b.number);
  });

  const formatted = filtered.map(s => ({
    studentId: String(s.studentId),
    nationalId: s.nationalId ? String(s.nationalId) : '',
    prefix: s.prefix || '',
    firstName: s.firstName || '',
    lastName: s.lastName || '',
    fullName: `${s.prefix || ''}${s.firstName || ''} ${s.lastName || ''}`.trim(),
    nickname: s.nickname || '',
    gender: s.gender || 'ชาย',
    grade: String(s.grade),
    room: String(s.room),
    number: Number(s.number) || 0,
    status: s.status || 'ปกติ',
    parentName: s.parentName || '',
    parentPhone: s.parentPhone || '',
    address: s.address || '',
    medicalNote: s.medicalNote || ''
  }));

  return {
    success: true,
    count: formatted.length,
    data: formatted
  };
}

function apiGetStudentById(studentId) {
  if (!studentId) return { success: false, message: 'กรุณาระบุรหัสนักเรียน' };

  const sheet = getSheetByName(SHEET_NAMES.STUDENTS);
  const rows = getSheetDataAsObjects(sheet);
  const student = rows.find(s => String(s.studentId) === String(studentId));

  if (!student) {
    return { success: false, message: 'ไม่พบข้อมูลนักเรียนรหัส: ' + studentId };
  }

  return { success: true, data: student };
}

// ==============================================================================
// 📝 6. ATTENDANCE OPERATIONS (SMART UPSERT ENGINE)
// ==============================================================================

function apiSaveAttendance(params) {
  const date = sanitizeDate(params.date);
  const grade = params.grade;
  const room = params.room;
  const checkedBy = params.checkedBy || 'UNKNOWN';
  const checkedByName = params.checkedByName || checkedBy;
  let records = params.records;

  if (typeof records === 'string') {
    try {
      records = JSON.parse(records);
    } catch(e) {
      return { success: false, message: 'รูปแบบข้อมูล records ผิดพลาด (JSON parse failed)' };
    }
  }

  if (!date || !records || !Array.isArray(records) || records.length === 0) {
    return { success: false, message: 'ข้อมูลไม่ครบถ้วน (date หรือ records หายไป)' };
  }

  const sheet = getSheetByName(SHEET_NAMES.ATTENDANCE);
  const existingData = sheet.getDataRange().getValues();
  const timestamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

  // ตรวจสอบ Map ของข้อมูลเดิมในวันนั้น เพื่อทำการ Update แทนการ Insert ซ้ำ
  // Key = date + "_" + studentId
  const existingRowMap = new Map();
  if (existingData.length > 1) {
    for (let r = 1; r < existingData.length; r++) {
      const rowDate = sanitizeDate(existingData[r][0]);
      const rowStdId = String(existingData[r][1]);
      if (rowDate === date) {
        existingRowMap.set(`${rowDate}_${rowStdId}`, r + 1); // 1-based index
      }
    }
  }

  let updatedCount = 0;
  let insertedCount = 0;
  const newRowsToAppend = [];

  records.forEach(rec => {
    const studentId = String(rec.studentId);
    const key = `${date}_${studentId}`;
    const status = rec.status || ATTENDANCE_STATUS.PRESENT;
    const arrivalTime = rec.arrivalTime || '';
    const note = rec.note || '';

    if (existingRowMap.has(key)) {
      // 🔄 มีข้อมูลเดิมอยู่แล้ว -> UPDATE แถวเดิม (1 API call รวดเร็ว)
      const rowNum = existingRowMap.get(key);
      sheet.getRange(rowNum, 11, 1, 6).setValues([[
        status, arrivalTime, note, checkedBy, checkedByName, timestamp
      ]]);
      updatedCount++;
    } else {
      // ➕ ยังไม่มี -> เตรียมเพิ่มแถวใหม่
      newRowsToAppend.push([
        date,
        studentId,
        rec.prefix || '',
        rec.firstName || '',
        rec.lastName || '',
        rec.nickname || '',
        rec.gender || 'ชาย',
        rec.grade || grade || '',
        rec.room || room || '',
        Number(rec.number) || 0,
        status,
        arrivalTime,
        note,
        checkedBy,
        checkedByName,
        timestamp
      ]);
      insertedCount++;
    }
  });

  // เขียนแถวใหม่ทั้งหมดในคำสั่งเดียวเพื่อประสิทธิภาพสูงสุด (Batch operation)
  if (newRowsToAppend.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRowsToAppend.length, newRowsToAppend[0].length).setValues(newRowsToAppend);
  }

  logActivity(checkedBy, 'SAVE_ATTENDANCE', `บันทึกเช็คชื่อ ${grade}/${room} วันที่ ${date} (อัปเดต: ${updatedCount}, เพิ่มใหม่: ${insertedCount})`, 'SUCCESS');

  return {
    success: true,
    message: `บันทึกข้อมูลเรียบร้อยแล้ว (อัปเดต ${updatedCount} คน, บันทึกใหม่ ${insertedCount} คน)`,
    date: date,
    grade: grade,
    room: room,
    updatedCount: updatedCount,
    insertedCount: insertedCount,
    totalRecords: records.length
  };
}

function apiGetAttendance(params) {
  const date = sanitizeDate(params.date);
  const grade = params.grade;
  const room = params.room;

  if (!date) return { success: false, message: 'กรุณาระบุวันที่ (date)' };

  const sheet = getSheetByName(SHEET_NAMES.ATTENDANCE);
  const rows = getSheetDataAsObjects(sheet);

  const matched = rows.filter(r => {
    if (sanitizeDate(r.date) !== date) return false;
    if (grade && grade !== 'ทั้งหมด' && String(r.grade) !== String(grade)) return false;
    if (room && room !== 'ทั้งหมด' && String(r.room) !== String(room)) return false;
    return true;
  });

  return {
    success: true,
    date: date,
    count: matched.length,
    data: matched
  };
}

// ==============================================================================
// 📊 7. DEEP ANALYTICS: สรุป ชาย-หญิง และ DASHBOARD รายงาน
// ==============================================================================

/**
 * สรุปรายห้องอย่างละเอียด: แยกเพศ ชาย - หญิง ในแต่ละสถานะ + สรุปอัตราส่วน %
 */
function apiGetRoomDailySummary(params) {
  const date = sanitizeDate(params.date);
  const grade = params.grade;
  const room = params.room;

  if (!date || !grade || !room) {
    return { success: false, message: 'กรุณาระบุ date, grade, และ room ให้ครบถ้วน' };
  }

  // 1. ดึงนักเรียนทั้งหมดในห้องนี้ (เฉพาะสถานะ 'ปกติ')
  const stdRes = apiGetStudents({ grade: grade, room: room, status: 'ปกติ' });
  const students = stdRes.data || [];

  // 2. ดึงข้อมูลที่เช็คชื่อแล้วของห้องนี้ในวันนี้
  const attRes = apiGetAttendance({ date: date, grade: grade, room: room });
  const attendanceList = attRes.data || [];
  const attMap = new Map();
  attendanceList.forEach(a => attMap.set(String(a.studentId), a));

  // โครงสร้างสรุปสถิติแบบแยก ชาย - หญิง
  const stats = {
    male: {
      total: 0,
      present: 0,
      absent: 0,
      sick: 0,
      business: 0,
      late: 0,
      activity: 0,
      unchecked: 0,
      attendanceRate: 0 // เปอร์เซ็นต์มาเรียน
    },
    female: {
      total: 0,
      present: 0,
      absent: 0,
      sick: 0,
      business: 0,
      late: 0,
      activity: 0,
      unchecked: 0,
      attendanceRate: 0
    },
    overall: {
      total: students.length,
      present: 0,
      absent: 0,
      sick: 0,
      business: 0,
      late: 0,
      activity: 0,
      unchecked: 0,
      checkedCount: attendanceList.length,
      attendanceRate: 0,
      isCompleted: (students.length > 0 && attendanceList.length >= students.length)
    }
  };

  const studentDetailList = [];
  const absentStudents = []; // รายชื่อคนที่ไม่ได้มาเรียน (ขาด/ลา/สาย) เพื่อความสะดวกของครู

  students.forEach(s => {
    const isMale = (s.gender === 'ชาย');
    const genderStat = isMale ? stats.male : stats.female;
    genderStat.total++;

    const att = attMap.get(String(s.studentId));
    const status = att ? att.status : ATTENDANCE_STATUS.UNCHECKED;
    const note = att ? att.note : '';
    const arrivalTime = att ? att.arrivalTime : '';

    // นับสถิติแต่ละสถานะ
    if (status === ATTENDANCE_STATUS.PRESENT) {
      genderStat.present++;
      stats.overall.present++;
    } else if (status === ATTENDANCE_STATUS.ABSENT) {
      genderStat.absent++;
      stats.overall.absent++;
      absentStudents.push({ ...s, status, note });
    } else if (status === ATTENDANCE_STATUS.SICK_LEAVE) {
      genderStat.sick++;
      stats.overall.sick++;
      absentStudents.push({ ...s, status, note });
    } else if (status === ATTENDANCE_STATUS.BUSINESS_LEAVE) {
      genderStat.business++;
      stats.overall.business++;
      absentStudents.push({ ...s, status, note });
    } else if (status === ATTENDANCE_STATUS.LATE) {
      genderStat.late++;
      stats.overall.late++;
      absentStudents.push({ ...s, status, arrivalTime, note });
    } else if (status === ATTENDANCE_STATUS.ACTIVITY) {
      genderStat.activity++;
      stats.overall.activity++;
    } else {
      genderStat.unchecked++;
      stats.overall.unchecked++;
    }

    studentDetailList.push({
      studentId: s.studentId,
      number: s.number,
      fullName: s.fullName,
      nickname: s.nickname,
      gender: s.gender,
      parentPhone: s.parentPhone,
      status: status,
      arrivalTime: arrivalTime,
      note: note,
      checkedAt: att ? att.updatedAt : ''
    });
  });

  // คำนวณเปอร์เซ็นต์การมาเรียน (มา + สาย + กิจกรรม ถือว่ามาโรงเรียน)
  if (stats.male.total > 0) {
    const maleAttended = stats.male.present + stats.male.late + stats.male.activity;
    stats.male.attendanceRate = Number(((maleAttended / stats.male.total) * 100).toFixed(1));
  }
  if (stats.female.total > 0) {
    const femaleAttended = stats.female.present + stats.female.late + stats.female.activity;
    stats.female.attendanceRate = Number(((femaleAttended / stats.female.total) * 100).toFixed(1));
  }
  if (stats.overall.total > 0) {
    const totalAttended = stats.overall.present + stats.overall.late + stats.overall.activity;
    stats.overall.attendanceRate = Number(((totalAttended / stats.overall.total) * 100).toFixed(1));
  }

  return {
    success: true,
    date: date,
    grade: grade,
    room: room,
    stats: stats,
    absentList: absentStudents,
    students: studentDetailList
  };
}

/**
 * สรุปภาพรวมทั้งโรงเรียน (สำหรับ Admin / หัวหน้าสายชั้น / ผู้บริหาร)
 * แยกเป็นรายสายชั้น รายห้อง และระบุว่าห้องไหน "ยังไม่ได้เช็คชื่อ"
 */
function apiGetSchoolDailySummary(params) {
  const date = sanitizeDate(params.date);
  if (!date) return { success: false, message: 'กรุณาระบุวันที่ (date)' };

  // 1. ดึงนักเรียนปกติทั้งหมด
  const allStudents = apiGetStudents({ status: 'ปกติ' }).data || [];

  // 1.1 ดึงข้อมูลครูประจำชั้น
  const teachersSheet = getSheetByName(SHEET_NAMES.TEACHERS);
  const teacherRows = teachersSheet ? getSheetDataAsObjects(teachersSheet) : [];
  const homeroomMap = {};
  teacherRows.forEach(t => {
    if (t.grade && t.grade !== 'ทั้งหมด') {
      homeroomMap[t.grade] = t;
    }
  });

  // 2. ดึงประวัติเช็คชื่อทั้งหมดของวันนี้
  const allAttendance = apiGetAttendance({ date: date }).data || [];
  const attMap = new Map();
  allAttendance.forEach(a => attMap.set(String(a.studentId), a));

  // โครงสร้างภาพรวมทั้งโรงเรียน
  const schoolSummary = {
    totalStudents: allStudents.length,
    male: { total: 0, present: 0, absent: 0, sick: 0, business: 0, late: 0, activity: 0, unchecked: 0, rate: 0 },
    female: { total: 0, present: 0, absent: 0, sick: 0, business: 0, late: 0, activity: 0, unchecked: 0, rate: 0 },
    overall: { total: allStudents.length, present: 0, absent: 0, sick: 0, business: 0, late: 0, activity: 0, unchecked: 0, rate: 0 }
  };

  // แผนที่สรุปแยกรายห้อง
  const roomMap = {};

  allStudents.forEach(s => {
    const key = `${s.grade}/${s.room}`;
    if (!roomMap[key]) {
      const hr = homeroomMap[s.grade] || {};
      roomMap[key] = {
        grade: s.grade,
        room: s.room,
        className: `${s.grade}/${s.room}`,
        homeroomTeacher: hr.fullName || 'ไม่ระบุ',
        homeroomPhone: hr.phone || '-',
        checkedBy: '-',
        checkedByName: '-',
        checkedAt: '-',
        total: 0,
        checkedCount: 0,
        male: { total: 0, present: 0, absent: 0, sick: 0, business: 0, late: 0, unchecked: 0 },
        female: { total: 0, present: 0, absent: 0, sick: 0, business: 0, late: 0, unchecked: 0 },
        overall: { total: 0, present: 0, absent: 0, sick: 0, business: 0, late: 0, unchecked: 0, rate: 0 },
        status: 'ยังไม่เช็ค' // 'เช็คครบแล้ว' | 'กำลังเช็ค' | 'ยังไม่เช็ค'
      };
    }

    const rm = roomMap[key];
    const isMale = (s.gender === 'ชาย');
    const rmGender = isMale ? rm.male : rm.female;
    const schGender = isMale ? schoolSummary.male : schoolSummary.female;

    rm.total++;
    rm.overall.total++;
    rmGender.total++;
    schGender.total++;

    const att = attMap.get(String(s.studentId));
    const status = att ? att.status : ATTENDANCE_STATUS.UNCHECKED;

    if (att) {
      rm.checkedCount++;
      if (att.checkedByName && rm.checkedByName === '-') {
        rm.checkedBy = att.checkedBy || '-';
        rm.checkedByName = att.checkedByName || '-';
        rm.checkedAt = att.updatedAt || '-';
      }
    }

    if (status === ATTENDANCE_STATUS.PRESENT) {
      rmGender.present++;
      rm.overall.present++;
      schGender.present++;
      schoolSummary.overall.present++;
    } else if (status === ATTENDANCE_STATUS.ABSENT) {
      rmGender.absent++;
      rm.overall.absent++;
      schGender.absent++;
      schoolSummary.overall.absent++;
    } else if (status === ATTENDANCE_STATUS.SICK_LEAVE) {
      rmGender.sick++;
      rm.overall.sick++;
      schGender.sick++;
      schoolSummary.overall.sick++;
    } else if (status === ATTENDANCE_STATUS.BUSINESS_LEAVE) {
      rmGender.business++;
      rm.overall.business++;
      schGender.business++;
      schoolSummary.overall.business++;
    } else if (status === ATTENDANCE_STATUS.LATE) {
      rmGender.late++;
      rm.overall.late++;
      schGender.late++;
      schoolSummary.overall.late++;
    } else if (status === ATTENDANCE_STATUS.ACTIVITY) {
      rm.overall.present++;
      schoolSummary.overall.activity++;
    } else {
      rmGender.unchecked++;
      rm.overall.unchecked++;
      schGender.unchecked++;
      schoolSummary.overall.unchecked++;
    }
  });

  // คำนวณสถานะความคืบหน้าของแต่ละห้อง (Check status)
  const roomList = Object.values(roomMap);
  const pendingClasses = [];
  const completedClasses = [];

  roomList.forEach(r => {
    if (r.checkedCount === 0) {
      r.status = 'ยังไม่เช็ค';
      pendingClasses.push(r.className);
    } else if (r.checkedCount < r.total) {
      r.status = 'เช็คบางส่วน';
      pendingClasses.push(r.className);
    } else {
      r.status = 'เช็คครบแล้ว';
      completedClasses.push(r.className);
    }

    if (r.total > 0) {
      const attended = r.overall.present + r.overall.late;
      r.overall.rate = Number(((attended / r.total) * 100).toFixed(1));
    }
  });

  // คำนวณเปอร์เซ็นต์ภาพรวมโรงเรียน
  if (schoolSummary.overall.total > 0) {
    const totalAttended = schoolSummary.overall.present + schoolSummary.overall.late;
    schoolSummary.overall.rate = Number(((totalAttended / schoolSummary.overall.total) * 100).toFixed(1));
  }
  if (schoolSummary.male.total > 0) {
    const maleAttended = schoolSummary.male.present + schoolSummary.male.late;
    schoolSummary.male.rate = Number(((maleAttended / schoolSummary.male.total) * 100).toFixed(1));
  }
  if (schoolSummary.female.total > 0) {
    const femaleAttended = schoolSummary.female.present + schoolSummary.female.late;
    schoolSummary.female.rate = Number(((femaleAttended / schoolSummary.female.total) * 100).toFixed(1));
  }

  // เรียงลำดับห้อง: ป.1/1, ป.1/2, ป.2/1...
  roomList.sort((a, b) => {
    if (a.grade !== b.grade) return a.grade.localeCompare(b.grade);
    return Number(a.room) - Number(b.room);
  });

  return {
    success: true,
    date: date,
    schoolSummary: schoolSummary,
    classProgress: {
      totalClasses: roomList.length,
      completedCount: completedClasses.length,
      pendingCount: pendingClasses.length,
      pendingClasses: pendingClasses
    },
    rooms: roomList
  };
}

/**
 * ค้นหานักเรียนที่มีแนวโน้มขาดเรียนบ่อย (At-Risk Watchlist เช่น ขาดสะสมเกิน 3 วัน)
 */
function apiGetAbsenceWatchlist(params) {
  const threshold = Number(params.threshold) || 3;
  const sheet = getSheetByName(SHEET_NAMES.ATTENDANCE);
  const rows = getSheetDataAsObjects(sheet);

  // นับจำนวนครั้งที่ ขาด, ลา, สาย ของแต่ละนักเรียน
  const countMap = {};
  rows.forEach(r => {
    const id = String(r.studentId);
    if (!countMap[id]) {
      countMap[id] = {
        studentId: id,
        fullName: `${r.prefix || ''}${r.firstName || ''} ${r.lastName || ''}`.trim(),
        grade: r.grade,
        room: r.room,
        number: r.number,
        absentCount: 0,
        sickCount: 0,
        businessCount: 0,
        lateCount: 0,
        dates: []
      };
    }
    const item = countMap[id];
    if (r.status === ATTENDANCE_STATUS.ABSENT) {
      item.absentCount++;
      item.dates.push(`${r.date} (ขาด)`);
    } else if (r.status === ATTENDANCE_STATUS.SICK_LEAVE) {
      item.sickCount++;
      item.dates.push(`${r.date} (ลาป่วย)`);
    } else if (r.status === ATTENDANCE_STATUS.BUSINESS_LEAVE) {
      item.businessCount++;
      item.dates.push(`${r.date} (ลากิจ)`);
    } else if (r.status === ATTENDANCE_STATUS.LATE) {
      item.lateCount++;
    }
  });

  // กรองเฉพาะคนที่ขาดเรียน >= threshold
  const watchlist = Object.values(countMap)
    .filter(item => item.absentCount >= threshold)
    .sort((a, b) => b.absentCount - a.absentCount);

  return {
    success: true,
    threshold: threshold,
    count: watchlist.length,
    data: watchlist
  };
}

/**
 * ดูประวัติการมาเรียนย้อนหลังของนักเรียนรายบุคคล
 */
function apiGetStudentAttendanceHistory(params) {
  const studentId = params.studentId;
  if (!studentId) return { success: false, message: 'กรุณาระบุรหัสนักเรียน' };

  const sheet = getSheetByName(SHEET_NAMES.ATTENDANCE);
  const rows = getSheetDataAsObjects(sheet);

  const history = rows.filter(r => String(r.studentId) === String(studentId));
  history.sort((a, b) => String(b.date).localeCompare(String(a.date))); // ล่าสุดขึ้นก่อน

  return {
    success: true,
    studentId: studentId,
    totalRecords: history.length,
    history: history
  };
}

// ==============================================================================
// 🏢 8. METADATA, STRUCTURE & SETTINGS
// ==============================================================================

function apiGetSchoolStructure() {
  const sheet = getSheetByName(SHEET_NAMES.STUDENTS);
  const rows = getSheetDataAsObjects(sheet);

  const gradeMap = {};
  rows.forEach(s => {
    const g = String(s.grade);
    const r = String(s.room);
    if (!gradeMap[g]) gradeMap[g] = new Set();
    gradeMap[g].add(r);
  });

  const structure = Object.keys(gradeMap).map(grade => ({
    grade: grade,
    rooms: Array.from(gradeMap[grade]).sort((a, b) => Number(a) - Number(b))
  }));

  // เรียงระดับชั้น ป.1 -> ป.6 -> ม.1
  structure.sort((a, b) => a.grade.localeCompare(b.grade));

  return { success: true, data: structure };
}

function apiGetSchoolSettings() {
  const sheet = getSheetByName(SHEET_NAMES.SETTINGS);
  const rows = getSheetDataAsObjects(sheet);
  const config = {};
  rows.forEach(r => {
    config[r.key] = r.value;
  });
  return { success: true, settings: config };
}

// ==============================================================================
// 🛠️ 9. HELPER UTILITIES & AUDIT LOGS
// ==============================================================================

/**
 * ฟังก์ชันค้นหาและเชื่อมต่อ Google Sheets แบบอัจฉริยะ (Universal Spreadsheet Resolver)
 * 1. ถ้าใส่ SPREADSHEET_ID ไว้ -> ใช้ชีตนั้นทันที
 * 2. ถ้าเป็น Container-bound script (เปิดจากใน Google Sheets) -> ใช้ active spreadsheet
 * 3. ถ้าเป็น Standalone script แล้วยังไม่มีชีต -> สร้าง Google Sheets ใหม่ใน Drive ให้อัตโนมัติทันที!
 */
const SHEET_HEADERS = {
  teachers: [
    'username', 'password', 'name', 'position', 'grade', 'room', 'role', 'phone', 'email', 'status'
  ],
  students: [
    'studentId', 'nationalId', 'prefix', 'firstName', 'lastName', 'nickname',
    'gender', 'grade', 'room', 'number', 'status', 'parentName', 'parentPhone', 'address', 'medicalNote'
  ],
  attendance: [
    'date', 'studentId', 'prefix', 'firstName', 'lastName', 'nickname',
    'gender', 'grade', 'room', 'number', 'status', 'arrivalTime',
    'note', 'checkedBy', 'checkedByName', 'updatedAt'
  ],
  settings: ['key', 'value', 'description'],
  audit_logs: ['timestamp', 'username', 'action', 'details', 'status']
};

function getSpreadsheet() {
  // 1. ตรวจสอบว่ามีการใส่ ID หรือ URL มาหรือไม่
  if (typeof SPREADSHEET_ID !== 'undefined' && SPREADSHEET_ID && SPREADSHEET_ID.trim() !== '') {
    const sheetId = extractSpreadsheetId(SPREADSHEET_ID.trim());
    try {
      return SpreadsheetApp.openById(sheetId);
    } catch(e) {
      throw new Error('❌ เปิดชีตไม่ได้! โปรดตรวจสอบว่าลิงก์ Google Sheet ถูกต้องและมีสิทธิ์เข้าถึง (' + e.message + ')');
    }
  }

  // 2. ถ้าไม่ได้ใส่ ID ให้เช็คว่าโค้ดนี้ผูกอยู่กับ Google Sheet โดยตรงหรือไม่
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch(e) {}

  // 3. ถ้าไม่มีทั้งคู่ ให้บังคับผู้ใช้เอาลิงก์มาใส่ (ป้องกันการสร้างชีตขยะเต็มไดรฟ์)
  throw new Error('🛑 ระบบหยุดทำงาน: คุณยังไม่ได้ใส่ลิงก์ Google Sheet ในโค้ดบรรทัดที่ 47 (const SPREADSHEET_ID)');
}

/**
 * ดึง Spreadsheet ID แม้ว่าผู้ใช้จะก๊อปปี้มาเป็น Full URL ก็ตาม
 */
function extractSpreadsheetId(input) {
  if (!input) return '';
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return input;
}

function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  // ป้องกันตารางไม่มีหัวข้อ หรือหัวข้อเสียหาย
  if (sheet.getLastRow() === 0 && SHEET_HEADERS[name]) {
    const headers = SHEET_HEADERS[name];
    sheet.appendRow(headers);
    formatHeaderRow(sheet, headers.length);
  } else if (sheet.getLastRow() > 0 && SHEET_HEADERS[name]) {
    // ตรวจสอบว่าแถวที่ 1 เป็นหัวข้อจริงหรือไม่ (ป้องกันข้อมูลแถวแรกทับหัวตาราง)
    const firstCell = String(sheet.getRange(1, 1).getValue()).trim();
    const expectedFirst = SHEET_HEADERS[name][0];
    if (firstCell !== expectedFirst) {
      sheet.insertRowBefore(1);
      const headers = SHEET_HEADERS[name];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      formatHeaderRow(sheet, headers.length);
    }
  }
  return sheet;
}

function getSheetByName(name) {
  const ss = getSpreadsheet();
  return getOrCreateSheet(ss, name);
}

function formatHeaderRow(sheet, numCols) {
  const range = sheet.getRange(1, 1, 1, numCols);
  range.setFontWeight('bold')
       .setBackground('#1E3A8A') // Royal Navy Blue
       .setFontColor('#FFFFFF')
       .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
}

/**
 * อ่านข้อมูลแถวทั้งหมดในชีตและแปลงเป็น Array of Objects โดยใช้หัวคอลัมน์เป็น Keys
 */
function getSheetDataAsObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0].map(h => String(h).trim());
  const result = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    result.push(obj);
  }
  return result;
}

function sanitizeDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Bangkok', 'yyyy-MM-dd');
  }
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }
  // รองรับรูปแบบ DD/MM/YYYY หรือ DD-MM-YYYY
  const parts = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (parts) {
    const d = parts[1].padStart(2, '0');
    const m = parts[2].padStart(2, '0');
    let y = parseInt(parts[3], 10);
    if (y > 2500) y -= 543;
    return `${y}-${m}-${d}`;
  }
  return str;
}

function logActivity(username, action, details, status) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.LOGS);
    if (sheet) {
      const timestamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
      sheet.appendRow([timestamp, username, action, details, status]);
    }
  } catch(e) {
    // Silent fail for logging
  }
}
