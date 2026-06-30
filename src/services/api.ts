import axios from 'axios';

// สร้าง instance ของ axios และชี้ไปที่ NestJS (ปกติรันที่ port 3000)
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
});

// Interceptor: ก่อนที่ React จะยิง API ทุกครั้ง ให้แวะทำงานตรงนี้ก่อน
api.interceptors.request.use((config) => {
    // ไปค้นดูว่ามี Token เก็บไว้ในเครื่อง (localStorage) ไหม
    const token = localStorage.getItem('token');

    if (token) {
        // ถ้ามี ให้แปะบัตรผ่าน (Bearer Token) ไปด้วย
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;