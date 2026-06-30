import api from './api';

export const getSchoolSummary = async () => {
    // ยิงไปที่เส้นสรุปภาพรวมทั้งโรงเรียนที่เราทำไว้ใน NestJS
    const response = await api.get('/summary/school-wide');
    return response.data;
};

export const getClassrooms = async () => {
    const response = await api.get('/classrooms'); // สำหรับดึงจำนวนห้องเรียน
    return response.data;
};