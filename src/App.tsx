import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast'; // <--- 1. Import Toaster
import AdminLayout from './layouts/AdminLayout';
import Login from './pages/Login'; // <--- Import หน้า Login เข้ามา
import type { JSX } from 'react';
import Dashboard from './pages/Dashboard'; // <--- Import ไฟล์จริงมาแทน
import Students from './pages/Students'; // <--- Import ไฟล์จริงมาแทน
import Teachers from './pages/Teachers';
import Parents from './pages/Parents';
import Settings from './pages/Settings';
import Classrooms from './pages/Classrooms';
import PointCategories from './pages/PointCategories';
import AttendanceReports from './pages/AttendanceReports';
import AttendanceEditor from './pages/AttendanceEditor';
import AdminBehaviorManagement from './pages/AdminBehaviorManagement';
import AttendanceMonitoring from './pages/AttendanceMonitoring';
import SchoolSummary from './pages/SchoolSummary';
import AcademicCalendar from './pages/AcademicCalendar';
import Promotions from './pages/Promotions';
import StudentEnrollmentChanges from './pages/StudentEnrollmentChanges';
import InactiveStudents from './pages/InactiveStudents';

// คอมโพเนนต์สำหรับตรวจบัตรผ่าน (Protected Route)
const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const token = localStorage.getItem('token');
  // ถ้าไม่มี Token ให้ไล่กลับไปหน้า /login
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// const Dashboard = () => <div><h1 className="text-2xl font-bold">สรุปภาพรวม (Dashboard)</h1></div>;
// const Students = () => <div><h1 className="text-2xl font-bold">ระบบจัดการนักเรียน</h1></div>;

function App() {
  return (
    <BrowserRouter>
      {/* 2. วาง Toaster ไว้บนสุดของแอป พร้อมตั้งค่าเริ่มต้นให้สวยงาม */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            fontFamily: "'Noto Sans Thai', sans-serif",
            borderRadius: '10px',
            background: '#333',
            color: '#fff',
          },
        }}
      />
      <Routes>
        {/* หน้า Login ปล่อยให้เข้าได้อิสระ */}
        <Route path="/login" element={<Login />} />

        {/* หน้า Admin ทั้งหมด ต้องผ่านด่าน ProtectedRoute ก่อน */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="students" element={<Students />} />
          <Route path="teachers" element={<Teachers />} />
          <Route path="parents" element={<Parents />} />
          <Route path="classrooms" element={<Classrooms />} />
          <Route path="point-categories" element={<PointCategories />} />
          <Route path="attendance-reports" element={<AttendanceReports />} />
          <Route path="attendance-editor" element={<AttendanceEditor />} />
          <Route path="settings" element={<Settings />} />
          <Route path="behavior-points" element={<AdminBehaviorManagement />} />
          <Route path="attendance-monitoring" element={<AttendanceMonitoring />} />
          <Route path="school-summary" element={<SchoolSummary />} />
          <Route path="academic-calendar" element={<AcademicCalendar />} />
          <Route path="promotions" element={<Promotions />} />
          <Route path="student-enrollment-changes" element={<StudentEnrollmentChanges />} />
          <Route path="inactive-students" element={<InactiveStudents />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
