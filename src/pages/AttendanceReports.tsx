import { useState, useEffect, useMemo } from 'react';
import {
    Search, Calendar, Filter, FileText, BarChart2,
    CheckCircle, XCircle, Clock, Info, AlertTriangle, ChevronLeft, ChevronRight, Activity, FileDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx-js-style';
import api from '../services/api';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// --- Types ---
interface Classroom {
    id: number;
    name: string;
    termId?: number;
}

interface AcademicTerm {
    id: number;
    term: number;
    year: number;
    startDate?: string | null;
    endDate?: string | null;
    isActive: boolean;
}

interface AttendanceRecord {
    id: string;
    type: 'ASSEMBLY' | 'AREA';
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'ACTIVITY';
    date: string;
    student: {
        id?: string;
        citizenId: string;
        firstName: string;
        lastName: string;
        classroom: { name: string };
    };
    recorder: {
        firstName: string;
        lastName: string;
    };
}

interface AttendanceStudent {
    id: string;
    citizenId: string;
    firstName: string;
    lastName: string;
}

interface SummaryStatistics {
    totalStudents: number;
    totalChecked: number;
    notChecked: number;
    present: number;
    absent: number;
    late: number;
    leave: number;
    activity?: number;
}

interface SummaryPercentage {
    present: number;
    absent: number;
    late: number;
    leave: number;
    activity?: number;
    notChecked: number;
}

interface SummaryData {
    classroomId: number;
    classroomName: string;
    statistics: SummaryStatistics;
    percentages: SummaryPercentage;
}

interface DailyStudentGroups {
    absent: Set<string>;
    leave: Set<string>;
    assembly: Set<string>;
    area: Set<string>;
}

interface DailyClassroomStatistics {
    classroomName: string;
    totalStudents: number;
}

const ITEMS_PER_PAGE = 10;

const getTodayString = () => new Date().toISOString().split('T')[0];

const dateOnly = (date: string) => date.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? date;

const parseIsoDate = (date: string) => {
    const [year, month, day] = dateOnly(date).split('-').map(Number);
    return new Date(year, month - 1, day);
};

const toIsoDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getDateRange = (startDate?: string | null, endDate?: string | null) => {
    if (!startDate || !endDate) return [];

    const start = parseIsoDate(startDate);
    const end = parseIsoDate(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

    const dates: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
        dates.push(toIsoDate(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }

    return dates;
};

const formatDateTime = (date: string) =>
    new Date(date).toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

const getClassroomExportStatusLabel = (status: AttendanceRecord['status']) => {
    switch (status) {
        case 'PRESENT': return 'มา';
        case 'ABSENT': return 'ขาด';
        case 'LATE': return 'สาย';
        case 'LEAVE': return 'ลา';
        case 'ACTIVITY': return 'กิจกรรม';
    }
};

const getClassroomExportTypeLabel = (type: AttendanceRecord['type']) =>
    type === 'ASSEMBLY' ? 'เข้าแถว' : 'เขตพื้นที่';

const getGradeLevel = (classroomName: string) => {
    const thaiDigits: Record<string, string> = {
        '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4',
        '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9'
    };
    const normalizedName = classroomName
        .replace(/[๐-๙]/g, digit => thaiDigits[digit])
        .replace(/\s+/g, '')
        .toLowerCase();
    const secondaryMatch = normalizedName.match(/(?:มัธยมศึกษาปีที่|มัธยม|ม\.?|m\.?)([1-6])(?:\/|\-|ห้อง|$)/);
    if (secondaryMatch) {
        return { key: `ม.${secondaryMatch[1]}`, order: 100 + Number(secondaryMatch[1]) };
    }

    const primaryMatch = normalizedName.match(/(?:ประถมศึกษาปีที่|ประถม|ป\.?|p\.?)([1-6])(?:\/|\-|ห้อง|$)/);
    if (primaryMatch) {
        return { key: `ป.${primaryMatch[1]}`, order: 50 + Number(primaryMatch[1]) };
    }

    const kindergartenMatch = normalizedName.match(/(?:อนุบาล|อ\.?)([1-3])(?:\/|\-|$)/);
    if (kindergartenMatch) {
        return { key: `อ.${kindergartenMatch[1]}`, order: Number(kindergartenMatch[1]) };
    }

    // หากชื่อห้องเป็นเพียง 1/1, 2/3 หรือ "ห้อง1/1" ให้ถือว่าเลขหน้าคือระดับมัธยม
    const leadingLevelMatch = normalizedName.match(/(?:^|ห้อง)([1-6])(?:\/|\-)\d+/);
    if (leadingLevelMatch) {
        return { key: `ม.${leadingLevelMatch[1]}`, order: 100 + Number(leadingLevelMatch[1]) };
    }

    // รูปแบบอื่นที่ยังมีเลขระดับอยู่หน้าหมายเลขห้อง เช่น "ระดับชั้น1/2"
    const levelBeforeRoomMatch = normalizedName.match(/(?:ระดับชั้น|ชั้น)([1-6])(?:\/|\-)\d+/);
    if (levelBeforeRoomMatch) {
        return { key: `ม.${levelBeforeRoomMatch[1]}`, order: 100 + Number(levelBeforeRoomMatch[1]) };
    }

    return { key: 'อื่น ๆ', order: 999 };
};

const createEmptyDailyStudentGroups = (): DailyStudentGroups => ({
    absent: new Set<string>(),
    leave: new Set<string>(),
    assembly: new Set<string>(),
    area: new Set<string>()
});

const getPercentage = (value: number, total: number) =>
    total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0;

const mergeStudentGroups = (target: DailyStudentGroups, source: DailyStudentGroups) => {
    source.absent.forEach(studentId => target.absent.add(studentId));
    source.leave.forEach(studentId => target.leave.add(studentId));
    source.assembly.forEach(studentId => target.assembly.add(studentId));
    source.area.forEach(studentId => target.area.add(studentId));
    return target;
};

const parseAttendanceRecords = (data: any): AttendanceRecord[] => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.records)) return data.records;

    return [
        ...(data?.records?.ASSEMBLY || []),
        ...(data?.records?.AREA || [])
    ];
};

export default function AttendanceReports() {
    const [activeTab, setActiveTab] = useState<'HISTORY' | 'SUMMARY'>('HISTORY');
    const [loading, setLoading] = useState(false);
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);
    const [activeTerm, setActiveTerm] = useState<AcademicTerm | null>(null);
    const [exportingKey, setExportingKey] = useState<string | null>(null);

    // --- Filters State ---
    const [filterDate, setFilterDate] = useState(getTodayString());
    const [filterClassroomId, setFilterClassroomId] = useState('');
    const [filterType, setFilterType] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    // --- Pagination States (แยกอิสระ 2 Tab) ---
    const [historyPage, setHistoryPage] = useState(1);
    const [summaryPage, setSummaryPage] = useState(1);

    // --- Data State ---
    const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);
    const [summaryData, setSummaryData] = useState<SummaryData[]>([]);

    // 1. ดึงรายชื่อห้องเรียนและภาคเรียนปัจจุบัน
    useEffect(() => {
        Promise.all([
            api.get('/classrooms'),
            api.get('/terms')
        ]).then(([classroomsRes, termsRes]) => {
            setClassrooms(classroomsRes.data);
            setActiveTerm(termsRes.data.find((term: AcademicTerm) => term.isActive) ?? termsRes.data[0] ?? null);
        }).catch(() => { });
    }, []);

    // 2. ดึงข้อมูลเมื่อ Filter เปลี่ยน
    useEffect(() => {
        if (activeTab === 'HISTORY') {
            fetchHistory();
        } else {
            fetchSummary();
        }
    }, [activeTab, filterDate, filterClassroomId, filterType]);

    // รีเซ็ตหน้ากลับไป 1 เสมอเมื่อมีการพิมพ์ค้นหา หรือเปลี่ยน Filter
    useEffect(() => {
        setHistoryPage(1);
        setSummaryPage(1);
    }, [searchQuery, filterDate, filterClassroomId, filterType]);

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (filterDate) params.append('date', filterDate);
            if (filterClassroomId) params.append('classroomId', filterClassroomId);
            if (filterType !== 'ALL') params.append('type', filterType);

            const res = await api.get(`/attendance/history/daily?${params.toString()}`);
            setHistoryRecords(parseAttendanceRecords(res.data));
        } catch (error) {
            toast.error('ไม่สามารถโหลดประวัติการเช็คชื่อได้');
        } finally {
            setLoading(false);
        }
    };

    const fetchSummary = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (filterDate) params.append('date', filterDate);
            if (filterClassroomId) params.append('classroomId', filterClassroomId);
            if (filterType !== 'ALL') params.append('type', filterType);

            const res = await api.get(`/attendance/summary/daily?${params.toString()}`);
            setSummaryData(res.data.summary || []);
        } catch (error) {
            toast.error('ไม่สามารถโหลดสรุปสถิติได้');
        } finally {
            setLoading(false);
        }
    };

    // --- Logic สำหรับ Tab: HISTORY ---
    const filteredHistory = useMemo(() => {
        return historyRecords.filter(r =>
            `${r.student.firstName} ${r.student.lastName} ${r.student.citizenId} ${r.student.classroom.name}`
                .toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [historyRecords, searchQuery]);

    const totalHistoryPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE);
    const paginatedHistory = useMemo(() => {
        const start = (historyPage - 1) * ITEMS_PER_PAGE;
        return filteredHistory.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredHistory, historyPage]);

    // --- Logic สำหรับ Tab: SUMMARY ---
    const filteredSummary = useMemo(() => {
        return summaryData.filter(s =>
            s.classroomName.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [summaryData, searchQuery]);

    const totalSummaryPages = Math.ceil(filteredSummary.length / ITEMS_PER_PAGE);
    const paginatedSummary = useMemo(() => {
        const start = (summaryPage - 1) * ITEMS_PER_PAGE;
        return filteredSummary.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredSummary, summaryPage]);

    // Chart Data (แสดงผลทั้งหมดที่ถูกกรอง ไม่แบ่งหน้าในกราฟ)
    const chartData = filteredSummary.map(s => ({
        name: s.classroomName,
        มาเรียน: s.statistics.present,
        มาสาย: s.statistics.late,
        ลา: s.statistics.leave,
        กิจกรรม: s.statistics.activity ?? 0,
        ขาด: s.statistics.absent,
        ยังไม่เช็ค: s.statistics.notChecked,
    }));

    const exportDailyStatisticsWorkbook = (
        records: AttendanceRecord[],
        classroomSummaries: SummaryData[],
        reportDate: string
    ) => {
        const classroomStatistics = new Map<string, DailyClassroomStatistics>();
        classroomSummaries.forEach(summary => {
            classroomStatistics.set(summary.classroomName, {
                classroomName: summary.classroomName,
                totalStudents: summary.statistics.totalStudents
            });
        });

        const studentIdsByClassroom = new Map<string, Set<string>>();
        records.forEach(record => {
            const classroomName = record.student.classroom?.name ?? '';
            if (!classroomName) return;

            const studentIds = studentIdsByClassroom.get(classroomName) ?? new Set<string>();
            studentIds.add(record.student.citizenId);
            studentIdsByClassroom.set(classroomName, studentIds);

            if (!classroomStatistics.has(classroomName)) {
                classroomStatistics.set(classroomName, {
                    classroomName,
                    totalStudents: 0
                });
            }
        });
        studentIdsByClassroom.forEach((studentIds, classroomName) => {
            const classroom = classroomStatistics.get(classroomName);
            if (classroom && classroom.totalStudents === 0) {
                classroom.totalStudents = studentIds.size;
            }
        });

        if (classroomStatistics.size === 0) {
            toast.error('ไม่มีข้อมูลสำหรับส่งออก');
            return;
        }

        const latestRecordByStudentAndType = new Map<string, AttendanceRecord>();
        records
            .slice()
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .forEach(record => {
                const classroomName = record.student.classroom?.name ?? '';
                const key = `${classroomName}|${record.student.citizenId}|${record.type}`;
                latestRecordByStudentAndType.set(key, record);
            });

        const studentGroupsByClassroom = new Map<string, DailyStudentGroups>();
        latestRecordByStudentAndType.forEach(record => {
            const classroomName = record.student.classroom?.name ?? '';
            const studentId = record.student.citizenId;
            const groups = studentGroupsByClassroom.get(classroomName) ?? createEmptyDailyStudentGroups();

            if (record.status === 'ABSENT') groups.absent.add(studentId);
            if (record.status === 'LEAVE') groups.leave.add(studentId);
            if (['PRESENT', 'LATE'].includes(record.status)) {
                if (record.type === 'ASSEMBLY') groups.assembly.add(studentId);
                if (record.type === 'AREA') groups.area.add(studentId);
            }
            studentGroupsByClassroom.set(classroomName, groups);
        });

        const gradeLevels = new Map<string, {
            order: number;
            classrooms: DailyClassroomStatistics[];
        }>();
        Array.from(classroomStatistics.values()).forEach(classroom => {
            const grade = getGradeLevel(classroom.classroomName);
            const gradeLevel = gradeLevels.get(grade.key) ?? { order: grade.order, classrooms: [] };
            gradeLevel.classrooms.push(classroom);
            gradeLevels.set(grade.key, gradeLevel);
        });

        const createStatisticsRow = (
            label: string,
            totalStudents: number,
            groups: DailyStudentGroups,
            showZeroAsDash = false
        ): (string | number)[] => {
            const absentOrLeaveCount = groups.absent.size + groups.leave.size;
            const attendedCount = new Set([...groups.area, ...groups.assembly]).size;
            const displayCount = (value: number) => showZeroAsDash && value === 0 ? '-' : value;
            return [
                label,
                totalStudents,
                displayCount(groups.absent.size),
                displayCount(groups.leave.size),
                displayCount(absentOrLeaveCount),
                getPercentage(absentOrLeaveCount, totalStudents),
                displayCount(groups.area.size),
                displayCount(groups.assembly.size),
                displayCount(attendedCount),
                getPercentage(attendedCount, totalStudents)
            ];
        };
        const sortedGradeLevels = Array.from(gradeLevels.entries())
            .sort(([, a], [, b]) => a.order - b.order);
        const reportRows: (string | number)[][] = [];
        const gradeSummaryRowNumbers: number[] = [];

        sortedGradeLevels.forEach(([gradeName, grade]) => {
            grade.classrooms
                .sort((a, b) => a.classroomName.localeCompare(b.classroomName, 'th', { numeric: true }))
                .forEach(classroom => {
                    reportRows.push(createStatisticsRow(
                        classroom.classroomName,
                        classroom.totalStudents,
                        studentGroupsByClassroom.get(classroom.classroomName)
                            ?? createEmptyDailyStudentGroups(),
                        true
                    ));
                });

            const totalStudents = grade.classrooms.reduce(
                (total, classroom) => total + classroom.totalStudents,
                0
            );
            const groups = grade.classrooms.reduce(
                (total, classroom) => mergeStudentGroups(
                    total,
                    studentGroupsByClassroom.get(classroom.classroomName)
                        ?? createEmptyDailyStudentGroups()
                ),
                createEmptyDailyStudentGroups()
            );
            reportRows.push(createStatisticsRow(`รวม ${gradeName}\nทั้งสิ้น`, totalStudents, groups));
            gradeSummaryRowNumbers.push(4 + reportRows.length);
        });
        const totalStudentsInSchool = Array.from(classroomStatistics.values()).reduce(
            (total, classroom) => total + classroom.totalStudents,
            0
        );
        const schoolGroups = Array.from(studentGroupsByClassroom.values()).reduce(
            (total, groups) => mergeStudentGroups(total, groups),
            createEmptyDailyStudentGroups()
        );
        reportRows.push(createStatisticsRow(
            'รวมทั้งหมด',
            totalStudentsInSchool,
            schoolGroups
        ));
        const schoolSummaryRowNumber = 4 + reportRows.length;
        const groupHeader = [
            'ระดับชั้น',
            'จำนวน\nทั้งหมด',
            'จำนวนนักเรียนที่ขาด/ลา',
            '',
            '',
            '',
            'จำนวนนักเรียนเข้าเขตพื้นที่และเข้าแถว',
            '',
            '',
            ''
        ];
        const subHeader = [
            '',
            '',
            'จำนวนที่ขาด',
            'จำนวนที่ลา',
            'รวม\nขาด ลา',
            'ขาดลา\nคิดเป็นร้อยละ',
            'จำนวนเข้าเขตฯ',
            'จำนวนเข้าแถว',
            'รวม\nมา',
            'มา คิด\nเป็นร้อยละ'
        ];
        const thaiReportDate = parseIsoDate(reportDate).toLocaleDateString('th-TH', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        const sheetRows: (string | number)[][] = [
            [`สรุปการเข้าแถวหน้าเสาธง ประจำวันที่ ${thaiReportDate}`],
            ['โรงเรียนเทพศิรินทร์พุแค สระบุรี'],
            groupHeader,
            subHeader,
            ...reportRows
        ];
        const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
        worksheet['!cols'] = [
            { wch: 16 },
            { wch: 12 },
            { wch: 11 },
            { wch: 11 },
            { wch: 11 },
            { wch: 14 },
            { wch: 14 },
            { wch: 13 },
            { wch: 11 },
            { wch: 14 }
        ];
        worksheet['!rows'] = Array.from({ length: sheetRows.length }, (_, index) => ({
            hpt: index < 2 ? 24 : index < 4 ? 38 : 21
        }));
        gradeSummaryRowNumbers.forEach(rowNumber => {
            worksheet['!rows']![rowNumber - 1] = { hpt: 34 };
        });
        worksheet['!merges'] = [
            XLSX.utils.decode_range('A1:J1'),
            XLSX.utils.decode_range('A2:J2'),
            XLSX.utils.decode_range('A3:A4'),
            XLSX.utils.decode_range('B3:B4'),
            XLSX.utils.decode_range('C3:F3'),
            XLSX.utils.decode_range('G3:J3')
        ];

        const baseFont = { name: 'TH Sarabun New', sz: 16, color: { rgb: '000000' } };
        const centered = { horizontal: 'center', vertical: 'center', wrapText: true };
        const thinBorder = {
            top: { style: 'thin', color: { rgb: 'FFFFFF' } },
            bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
            left: { style: 'thin', color: { rgb: 'FFFFFF' } },
            right: { style: 'thin', color: { rgb: 'FFFFFF' } }
        };
        const applyStyle = (
            range: string,
            style: Record<string, unknown>
        ) => {
            const decodedRange = XLSX.utils.decode_range(range);
            for (let row = decodedRange.s.r; row <= decodedRange.e.r; row += 1) {
                for (let column = decodedRange.s.c; column <= decodedRange.e.c; column += 1) {
                    const address = XLSX.utils.encode_cell({ r: row, c: column });
                    if (!worksheet[address]) {
                        worksheet[address] = { t: 's', v: '' };
                    }
                    worksheet[address].s = style;
                }
            }
        };
        const lastRow = sheetRows.length;
        applyStyle(`A1:J${lastRow}`, {
            font: baseFont,
            alignment: centered
        });
        applyStyle('A1:J2', {
            font: { ...baseFont, bold: true, sz: 18 },
            alignment: centered
        });
        applyStyle('A3:J4', {
            font: { ...baseFont, bold: true },
            fill: { patternType: 'solid', fgColor: { rgb: 'D0D0D0' } },
            alignment: centered,
            border: thinBorder
        });
        gradeSummaryRowNumbers.forEach(rowNumber => {
            applyStyle(`A${rowNumber}:J${rowNumber}`, {
                font: { ...baseFont, bold: true },
                fill: { patternType: 'solid', fgColor: { rgb: 'D0D0D0' } },
                alignment: centered
            });
        });
        applyStyle(`A${schoolSummaryRowNumber}:J${schoolSummaryRowNumber}`, {
            font: { ...baseFont, bold: true },
            alignment: centered,
            border: {
                top: { style: 'thin', color: { rgb: '000000' } }
            }
        });
        for (let row = 5; row <= lastRow; row += 1) {
            const absentPercentageCell = worksheet[`F${row}`];
            const presentPercentageCell = worksheet[`J${row}`];
            if (absentPercentageCell) absentPercentageCell.z = '0.##';
            if (presentPercentageCell) presentPercentageCell.z = '0.##';
        }
        worksheet['!margins'] = {
            left: 0.25,
            right: 0.25,
            top: 0.4,
            bottom: 0.4,
            header: 0.2,
            footer: 0.2
        };

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'สถิติประจำวัน');
        XLSX.writeFile(workbook, `สถิติการเช็คชื่อประจำวัน_${reportDate}.xlsx`, {
            cellStyles: true
        });
        toast.success('ส่งออกไฟล์ Excel สำเร็จ');
    };

    const fetchAttendanceForExport = async (params: URLSearchParams) => {
        const res = await api.get(`/attendance/history/daily?${params.toString()}`);
        return parseAttendanceRecords(res.data);
    };

    const fetchClassroomAttendanceForExport = async (classroomId: number) => {
        const today = getTodayString();
        const termEndDate = activeTerm?.endDate && dateOnly(activeTerm.endDate) < today
            ? activeTerm.endDate
            : today;
        const termDates = getDateRange(activeTerm?.startDate, termEndDate);

        if (!activeTerm?.id || termDates.length === 0) {
            throw new Error('ไม่พบช่วงวันที่ของภาคเรียนปัจจุบัน');
        }

        const records: AttendanceRecord[] = [];
        const batchSize = 8;

        for (let index = 0; index < termDates.length; index += batchSize) {
            const batch = termDates.slice(index, index + batchSize);
            const batchResults = await Promise.all(batch.map(async (date) => {
                const params = new URLSearchParams();
                params.append('termId', String(activeTerm.id));
                params.append('date', date);
                params.append('classroomId', String(classroomId));

                return fetchAttendanceForExport(params);
            }));

            records.push(...batchResults.flat());
        }

        return records;
    };

    const exportClassroomAttendanceWorkbook = (
        students: AttendanceStudent[],
        records: AttendanceRecord[],
        classroomName: string
    ) => {
        if (students.length === 0 && records.length === 0) {
            toast.error('ไม่มีข้อมูลสำหรับส่งออก');
            return;
        }

        const studentsByCitizenId = new Map<string, AttendanceStudent>();
        students.forEach(student => studentsByCitizenId.set(student.citizenId, student));
        records.forEach(record => {
            if (!studentsByCitizenId.has(record.student.citizenId)) {
                studentsByCitizenId.set(record.student.citizenId, {
                    id: record.student.id ?? record.student.citizenId,
                    citizenId: record.student.citizenId,
                    firstName: record.student.firstName,
                    lastName: record.student.lastName
                });
            }
        });

        const sortedStudents = Array.from(studentsByCitizenId.values()).sort((a, b) =>
            a.citizenId.localeCompare(b.citizenId, 'th', { numeric: true })
        );
        const attendanceTypes: AttendanceRecord['type'][] = ['ASSEMBLY', 'AREA'];
        const statusByStudentTypeAndDate = new Map<string, string>();

        records
            .slice()
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .forEach(record => {
                const key = `${record.student.citizenId}|${record.type}|${dateOnly(record.date)}`;
                statusByStudentTypeAndDate.set(key, getClassroomExportStatusLabel(record.status));
            });

        const workbook = XLSX.utils.book_new();
        const checkedDateCountByType = new Map<AttendanceRecord['type'], number>();

        attendanceTypes.forEach(type => {
            const checkedDates = Array.from(new Set(
                records
                    .filter(record => record.type === type)
                    .map(record => dateOnly(record.date))
            )).sort();
            const header = [
                'ลำดับ',
                'รหัสนักเรียน',
                'ชื่อ',
                'นามสกุล',
                'ห้องเรียน',
                'ประเภท',
                ...checkedDates.map(date => parseIsoDate(date).toLocaleDateString('th-TH'))
            ];
            const rows: (string | number)[][] = sortedStudents.map((student, index) => [
                index + 1,
                student.citizenId,
                student.firstName,
                student.lastName,
                classroomName,
                getClassroomExportTypeLabel(type),
                ...checkedDates.map(date =>
                    statusByStudentTypeAndDate.get(`${student.citizenId}|${type}|${date}`) ?? ''
                )
            ]);
            const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);

            worksheet['!cols'] = [
                { wch: 8 },
                { wch: 18 },
                { wch: 20 },
                { wch: 20 },
                { wch: 14 },
                { wch: 14 },
                ...checkedDates.map(() => ({ wch: 13 }))
            ];
            worksheet['!autofilter'] = { ref: worksheet['!ref'] ?? 'A1:F1' };
            checkedDateCountByType.set(type, checkedDates.length);
            XLSX.utils.book_append_sheet(workbook, worksheet, getClassroomExportTypeLabel(type));
        });

        const summarySheet = XLSX.utils.aoa_to_sheet([
            ['รายงานการเช็คชื่อรายห้อง'],
            ['วันที่ส่งออก', formatDateTime(new Date().toISOString())],
            ['ห้องเรียน', classroomName],
            ['ภาคเรียน', activeTerm ? `ภาคเรียน ${activeTerm.term}/${activeTerm.year}` : 'ภาคเรียนปัจจุบัน'],
            ['รูปแบบชีต', 'แยกข้อมูลเป็นชีตเข้าแถวและชีตเขตพื้นที่'],
            ['จำนวนวันที่เช็คเข้าแถว', checkedDateCountByType.get('ASSEMBLY') ?? 0],
            ['จำนวนวันที่เช็คเขตพื้นที่', checkedDateCountByType.get('AREA') ?? 0],
            ['จำนวนนักเรียน', sortedStudents.length]
        ]);

        summarySheet['!cols'] = [{ wch: 26 }, { wch: 48 }];

        XLSX.utils.book_append_sheet(workbook, summarySheet, 'สรุปเงื่อนไข');
        XLSX.writeFile(
            workbook,
            `รายงานเช็คชื่อ_${classroomName}_${activeTerm ? `${activeTerm.term}-${activeTerm.year}` : getTodayString()}.xlsx`
        );
        toast.success('ส่งออกไฟล์ Excel สำเร็จ');
    };

    const handleExportDailyStatistics = async () => {
        const exportKey = 'school-daily';
        try {
            setExportingKey(exportKey);
            const reportDate = filterDate || getTodayString();
            const params = new URLSearchParams();
            params.append('date', reportDate);

            const [records, summaryRes] = await Promise.all([
                fetchAttendanceForExport(params),
                api.get(`/attendance/summary/daily?${params.toString()}`)
            ]);
            exportDailyStatisticsWorkbook(records, summaryRes.data.summary || [], reportDate);
        } catch (error) {
            toast.error('ไม่สามารถส่งออกสถิติประจำวันได้');
        } finally {
            setExportingKey(null);
        }
    };

    const handleExportClassroom = async (classroomId: number, classroomName: string) => {
        const exportKey = `classroom-${classroomId}`;
        try {
            setExportingKey(exportKey);
            const [studentsRes, records] = await Promise.all([
                api.get(`/students?classroomId=${classroomId}`),
                fetchClassroomAttendanceForExport(classroomId)
            ]);

            exportClassroomAttendanceWorkbook(studentsRes.data as AttendanceStudent[], records, classroomName);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'ไม่สามารถส่งออกรายงานรายห้องได้');
        } finally {
            setExportingKey(null);
        }
    };

    // Helper Elements
    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'PRESENT': return <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><CheckCircle size={12} /> มาเรียน</span>;
            case 'ABSENT': return <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><XCircle size={12} /> ขาด</span>;
            case 'LATE': return <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Clock size={12} /> สาย</span>;
            case 'LEAVE': return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Info size={12} /> ลา</span>;
            case 'ACTIVITY': return <span className="bg-cyan-100 text-cyan-700 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Activity size={12} /> กิจกรรม</span>;
            default: return <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full text-xs font-bold w-fit">{status}</span>;
        }
    };

    const getTypeBadge = (type: string) => {
        return type === 'ASSEMBLY'
            ? <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded text-xs font-bold">เข้าแถว</span>
            : <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded text-xs font-bold">เขตพื้นที่</span>;
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">รายงานการเช็คชื่อ</h1>
                    <p className="text-gray-500">ดูประวัติรายบุคคล และสรุปสถิติการมาเรียนรายวัน</p>
                </div>
                <button
                    onClick={handleExportDailyStatistics}
                    disabled={exportingKey !== null}
                    className="flex items-center justify-center gap-2 border border-secondary/50 bg-secondary/25 hover:bg-secondary/40 text-[#6b5400] px-5 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-60"
                >
                    <FileDown size={20} /> Export สถิติประจำวัน
                </button>
            </div>

            {/* --- ตัวกรองส่วนกลาง --- */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="date"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-primary text-gray-700 font-medium"
                    />
                </div>
                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <select
                        value={filterClassroomId}
                        onChange={(e) => setFilterClassroomId(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-primary text-gray-700 font-medium bg-white"
                    >
                        <option value="">-- ทุกห้องเรียน --</option>
                        {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-primary text-gray-700 font-medium bg-white"
                    >
                        <option value="ALL">รวมทุกประเภท</option>
                        <option value="ASSEMBLY">เฉพาะเข้าแถวหน้าเสาธง</option>
                        <option value="AREA">เฉพาะเวรเขตพื้นที่</option>
                    </select>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder={activeTab === 'HISTORY' ? "ค้นหาชื่อ, นามสกุล..." : "ค้นหาชื่อห้องเรียน..."}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-primary text-gray-700"
                    />
                </div>
            </div>

            {/* --- Tabs Switcher --- */}
            <div className="flex border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('HISTORY')}
                    className={`flex items-center gap-2 px-6 py-3 font-bold border-b-2 transition-colors ${activeTab === 'HISTORY' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <FileText size={18} /> ประวัติรายบุคคล
                </button>
                <button
                    onClick={() => setActiveTab('SUMMARY')}
                    className={`flex items-center gap-2 px-6 py-3 font-bold border-b-2 transition-colors ${activeTab === 'SUMMARY' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <BarChart2 size={18} /> สรุปสถิติ
                </button>
            </div>

            {/* ---------------------------------------------------- */}
            {/* TAB 1: ประวัติรายบุคคล (HISTORY)                       */}
            {/* ---------------------------------------------------- */}
            {activeTab === 'HISTORY' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in duration-300">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left whitespace-nowrap">
                            <thead className="bg-gray-50 border-b border-gray-100 text-sm text-gray-600">
                                <tr>
                                    <th className="p-4 font-medium">เวลาที่บันทึก</th>
                                    <th className="p-4 font-medium">ประเภท</th>
                                    <th className="p-4 font-medium">รหัสประจำตัว</th>
                                    <th className="p-4 font-medium">ชื่อ-นามสกุล</th>
                                    <th className="p-4 font-medium">ห้องเรียน</th>
                                    <th className="p-4 font-medium">สถานะ</th>
                                    <th className="p-4 font-medium">ผู้บันทึก</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr><td colSpan={7} className="p-8 text-center text-gray-500">กำลังโหลดข้อมูล...</td></tr>
                                ) : paginatedHistory.length === 0 ? (
                                    <tr><td colSpan={7} className="p-8 text-center text-gray-500">ไม่พบประวัติการเช็คชื่อในเงื่อนไขที่เลือก</td></tr>
                                ) : (
                                    paginatedHistory.map((record) => (
                                        <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="p-4 text-gray-600 text-sm">
                                                {new Date(record.date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                                            </td>
                                            <td className="p-4">{getTypeBadge(record.type)}</td>
                                            <td className="p-4 font-mono text-gray-500 text-sm">{record.student.citizenId}</td>
                                            <td className="p-4">
                                                <span className="font-bold text-gray-800">{record.student.firstName} {record.student.lastName}</span>
                                            </td>
                                            <td className="p-4 text-gray-700">{record.student.classroom.name}</td>
                                            <td className="p-4">{getStatusBadge(record.status)}</td>
                                            <td className="p-4 text-gray-500 text-sm text-ellipsis overflow-hidden">
                                                ครู{record.recorder.firstName}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination (History) */}
                    {filteredHistory.length > 0 && (
                        <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <p className="text-sm text-gray-500">แสดง {paginatedHistory.length} จาก {filteredHistory.length} รายการ</p>
                            <div className="flex items-center gap-2">
                                <button
                                    disabled={historyPage === 1}
                                    onClick={() => setHistoryPage(prev => prev - 1)}
                                    className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-colors"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <span className="text-sm font-bold text-gray-700">หน้า {historyPage} / {totalHistoryPages || 1}</span>
                                <button
                                    disabled={historyPage === totalHistoryPages || totalHistoryPages === 0}
                                    onClick={() => setHistoryPage(prev => prev + 1)}
                                    className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-colors"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ---------------------------------------------------- */}
            {/* TAB 2: สรุปสถิติ (SUMMARY)                            */}
            {/* ---------------------------------------------------- */}
            {activeTab === 'SUMMARY' && (
                <div className="space-y-6 animate-in fade-in duration-300">

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                            <BarChart2 className="text-primary" /> กราฟแสดงสถิติการเข้าเรียนแยกตามห้อง
                        </h3>
                        {loading ? (
                            <div className="h-80 flex items-center justify-center text-gray-400">กำลังประมวลผลกราฟ...</div>
                        ) : filteredSummary.length === 0 ? (
                            <div className="h-80 flex items-center justify-center text-gray-400">ไม่มีข้อมูลแสดงสถิติในวันนี้</div>
                        ) : (
                            <div className="h-96 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                                        <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                        <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                        <Bar dataKey="มาเรียน" stackId="a" fill="#10B981" radius={[0, 0, 4, 4]} />
                                        <Bar dataKey="มาสาย" stackId="a" fill="#F59E0B" />
                                        <Bar dataKey="ลา" stackId="a" fill="#3B82F6" />
                                        <Bar dataKey="กิจกรรม" stackId="a" fill="#06B6D4" />
                                        <Bar dataKey="ขาด" stackId="a" fill="#EF4444" />
                                        <Bar dataKey="ยังไม่เช็ค" stackId="a" fill="#E5E7EB" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left whitespace-nowrap text-sm">
                                <thead className="bg-gray-50 border-b border-gray-100 text-gray-600">
                                    <tr>
                                        <th className="p-4 font-medium">ห้องเรียน</th>
                                        <th className="p-4 font-medium text-center">นักเรียนทั้งหมด</th>
                                        <th className="p-4 font-medium text-center text-green-700">มาเรียน</th>
                                        <th className="p-4 font-medium text-center text-orange-600">สาย</th>
                                        <th className="p-4 font-medium text-center text-blue-600">ลา</th>
                                        <th className="p-4 font-medium text-center text-cyan-600">กิจกรรม</th>
                                        <th className="p-4 font-medium text-center text-red-600">ขาด</th>
                                        <th className="p-4 font-medium text-center text-gray-500">ยังไม่เช็คชื่อ</th>
                                        <th className="p-4 font-medium text-right">ส่งออก</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {loading ? (
                                        <tr><td colSpan={9} className="p-8 text-center text-gray-500">กำลังโหลดตารางสถิติ...</td></tr>
                                    ) : paginatedSummary.length === 0 ? (
                                        <tr><td colSpan={9} className="p-8 text-center text-gray-500">ไม่พบข้อมูลสรุป</td></tr>
                                    ) : (
                                        paginatedSummary.map((s) => (
                                            <tr key={s.classroomId} className="hover:bg-gray-50 transition-colors">
                                                <td className="p-4 font-bold text-gray-800 text-base">{s.classroomName}</td>
                                                <td className="p-4 text-center font-bold text-gray-600">{s.statistics.totalStudents}</td>
                                                <td className="p-4 text-center">
                                                    <span className="font-bold text-green-600">{s.statistics.present}</span>
                                                    <span className="text-xs text-gray-400 ml-1">({s.percentages.present}%)</span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className="font-bold text-orange-500">{s.statistics.late}</span>
                                                    <span className="text-xs text-gray-400 ml-1">({s.percentages.late}%)</span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className="font-bold text-blue-500">{s.statistics.leave}</span>
                                                    <span className="text-xs text-gray-400 ml-1">({s.percentages.leave}%)</span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className="font-bold text-cyan-600">{s.statistics.activity ?? 0}</span>
                                                    <span className="text-xs text-gray-400 ml-1">({s.percentages.activity ?? 0}%)</span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className="font-bold text-red-500">{s.statistics.absent}</span>
                                                    <span className="text-xs text-gray-400 ml-1">({s.percentages.absent}%)</span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    {s.statistics.notChecked > 0 ? (
                                                        <span className="inline-flex items-center gap-1 font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                                            <AlertTriangle size={12} className="text-yellow-500" /> {s.statistics.notChecked}
                                                        </span>
                                                    ) : (
                                                        <span className="text-green-500"><CheckCircle size={16} className="mx-auto" /></span>
                                                    )}
                                                </td>
                                                <td className="p-4 text-right">
                                                    <button
                                                        onClick={() => handleExportClassroom(s.classroomId, s.classroomName)}
                                                        disabled={exportingKey !== null}
                                                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-white px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/5 disabled:opacity-60"
                                                        title="Export รายชื่อนักเรียนและสถานะเช็คชื่อตามวันที่ของภาคเรียนปัจจุบัน"
                                                    >
                                                        <FileDown size={14} /> Excel
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination (Summary) */}
                        {filteredSummary.length > 0 && (
                            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                                <p className="text-sm text-gray-500">แสดง {paginatedSummary.length} จาก {filteredSummary.length} ห้อง</p>
                                <div className="flex items-center gap-2">
                                    <button
                                        disabled={summaryPage === 1}
                                        onClick={() => setSummaryPage(prev => prev - 1)}
                                        className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-colors"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <span className="text-sm font-bold text-gray-700">หน้า {summaryPage} / {totalSummaryPages || 1}</span>
                                    <button
                                        disabled={summaryPage === totalSummaryPages || totalSummaryPages === 0}
                                        onClick={() => setSummaryPage(prev => prev + 1)}
                                        className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-colors"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
