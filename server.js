const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance_system', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

// Enhanced User Schema
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['student', 'teacher', 'admin'], required: true },
    name: { type: String, required: true },
    email: { type: String },
    class: { type: String }, // For students
    subject: { type: String }, // For teachers
    createdAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
});

// Enhanced Attendance Schema
const attendanceSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    class: { type: String, required: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ['present', 'absent', 'late'], required: true },
    markedBy: { type: String, required: true },
    markedAt: { type: Date, default: Date.now },
    subject: { type: String }
});

// Teacher Attendance Schema
const teacherAttendanceSchema = new mongoose.Schema({
    teacherId: { type: String, required: true },
    teacherName: { type: String, required: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ['present', 'absent', 'late'], required: true },
    markedAt: { type: Date, default: Date.now },
    notes: { type: String }
});
const noticeSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    type: { type: String, enum: ['homework', 'announcement', 'event', 'general'], required: true },
    postedBy: { type: String, required: true },
    postedByName: { type: String, required: true },
    targetClass: { type: String }, // Optional - if blank, notice is for all students
    targetRole: { type: String, enum: ['student', 'teacher', 'all'], default: 'student' },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    expiryDate: { type: Date }
});

// Enhanced Class Schema
const classSchema = new mongoose.Schema({
    className: { type: String, required: true, unique: true },
    teacher: { type: String, required: true },
    students: [{ type: String }],
    subjects: [{ type: String }],
    createdAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
});

const User = mongoose.model('User', userSchema);
const Attendance = mongoose.model('Attendance', attendanceSchema);
const TeacherAttendance = mongoose.model('TeacherAttendance', teacherAttendanceSchema);
const Class = mongoose.model('Class', classSchema);
const Notice = mongoose.model('Notice', noticeSchema);
// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Routes

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve teacher dashboard
app.get('/teacher', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'teacher-dashboard.html'));
});

// Login Route
app.post('/api/login', async (req, res) => {
    try {
        const { userId, password, role } = req.body;

        if (!userId || !password || !role) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const user = await User.findOne({ userId, role, isActive: true });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { userId: user.userId, role: user.role, name: user.name },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                userId: user.userId,
                name: user.name,
                role: user.role,
                class: user.class,
                subject: user.subject
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Register Route (for admin to create users)
app.post('/api/register', authenticateToken, async (req, res) => {
    try {
        // Allow both admin and teachers to create students
        if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { userId, password, role, name, email, class: userClass, subject } = req.body;

        // Teachers can only create students
        if (req.user.role === 'teacher' && role !== 'student') {
            return res.status(403).json({ error: 'Teachers can only create student accounts' });
        }

        const existingUser = await User.findOne({ userId });
        if (existingUser) {
            return res.status(400).json({ error: 'User ID already exists' });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUser = new User({
            userId,
            password: hashedPassword,
            role,
            name,
            email,
            class: userClass,
            subject
        });

        await newUser.save();

        // If it's a student, add to teacher's class
        if (role === 'student' && userClass) {
            await Class.findOneAndUpdate(
                { className: userClass },
                { $addToSet: { students: userId } },
                { upsert: false }
            );
        }

        res.status(201).json({
            message: 'User created successfully',
            user: {
                userId: newUser.userId,
                name: newUser.name,
                role: newUser.role,
                class: newUser.class,
                subject: newUser.subject
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get Dashboard Data
app.get('/api/dashboard', authenticateToken, async (req, res) => {
    try {
        const { role, userId } = req.user;

        if (role === 'student') {
            const attendance = await Attendance.find({ studentId: userId })
                .sort({ date: -1 })
                .limit(30);

            const totalDays = attendance.length;
            const presentDays = attendance.filter(a => a.status === 'present').length;
            const attendancePercentage = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

            res.json({
                role,
                attendance,
                stats: {
                    totalDays,
                    presentDays,
                    absentDays: totalDays - presentDays,
                    attendancePercentage: attendancePercentage.toFixed(2)
                }
            });

        } else if (role === 'teacher') {
            const classes = await Class.find({ teacher: userId, isActive: true });
            
            const recentAttendance = await Attendance.find({ markedBy: userId })
                .sort({ markedAt: -1 })
                .limit(50);

            res.json({
                role,
                classes,
                recentAttendance,
                stats: {
                    totalClasses: classes.length,
                    totalStudents: classes.reduce((sum, cls) => sum + cls.students.length, 0)
                }
            });

        } else if (role === 'admin') {
            const totalStudents = await User.countDocuments({ role: 'student', isActive: true });
            const totalTeachers = await User.countDocuments({ role: 'teacher', isActive: true });
            const totalClasses = await Class.countDocuments({ isActive: true });
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayAttendance = await Attendance.countDocuments({ 
                date: { $gte: today } 
            });

            res.json({
                role,
                stats: {
                    totalStudents,
                    totalTeachers,
                    totalClasses,
                    todayAttendance
                }
            });
        }

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Teacher Attendance Routes
app.get('/api/teacher-attendance', authenticateToken, async (req, res) => {
    try {
        const { teacherId } = req.query;
        const queryTeacherId = teacherId || req.user.userId;

        // Only allow teachers to view their own attendance or admin to view any
        if (req.user.role !== 'admin' && req.user.userId !== queryTeacherId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const attendance = await TeacherAttendance.find({ teacherId: queryTeacherId })
            .sort({ date: -1 });

        res.json(attendance);

    } catch (error) {
        console.error('Get teacher attendance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/teacher-attendance/mark', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only teachers can mark their attendance' });
        }

        const { teacherId, date, status, notes } = req.body;
        const targetTeacherId = teacherId || req.user.userId;

        // Only allow teachers to mark their own attendance
        if (req.user.role === 'teacher' && req.user.userId !== targetTeacherId) {
            return res.status(403).json({ error: 'You can only mark your own attendance' });
        }

        const teacher = await User.findOne({ userId: targetTeacherId, role: 'teacher' });
        if (!teacher) {
            return res.status(404).json({ error: 'Teacher not found' });
        }

        // Delete existing attendance for this date
        await TeacherAttendance.deleteOne({ 
            teacherId: targetTeacherId,
            date: new Date(date) 
        });

        // Create new attendance record
        const attendanceRecord = new TeacherAttendance({
            teacherId: targetTeacherId,
            teacherName: teacher.name,
            date: new Date(date),
            status,
            notes
        });

        await attendanceRecord.save();

        res.json({ message: 'Teacher attendance marked successfully' });

    } catch (error) {
        console.error('Mark teacher attendance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Student Attendance Routes (Enhanced)
app.post('/api/attendance/mark', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'teacher') {
            return res.status(403).json({ error: 'Only teachers can mark attendance' });
        }

        const { students, date, subject, class: className } = req.body;

        // Verify teacher has access to this class
        const classDoc = await Class.findOne({ className, teacher: req.user.userId });
        if (!classDoc) {
            return res.status(403).json({ error: 'You do not have access to this class' });
        }

        // Delete existing attendance for this date, class, and subject
        await Attendance.deleteMany({ 
            date: new Date(date),
            class: className,
            subject: subject,
            markedBy: req.user.userId
        });

        // Create new attendance records
        const attendanceRecords = students.map(student => ({
            studentId: student.studentId,
            studentName: student.studentName,
            class: className,
            date: new Date(date),
            status: student.status,
            markedBy: req.user.userId,
            subject: subject
        }));

        await Attendance.insertMany(attendanceRecords);

        res.json({ message: 'Attendance marked successfully' });

    } catch (error) {
        console.error('Mark attendance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get Students by Class (Enhanced)
app.get('/api/students/:className', authenticateToken, async (req, res) => {
    try {
        const { className } = req.params;

        // Check access permissions
        if (req.user.role === 'teacher') {
            const classDoc = await Class.findOne({ className, teacher: req.user.userId });
            if (!classDoc) {
                return res.status(403).json({ error: 'You do not have access to this class' });
            }
        }

        const students = await User.find({ 
            role: 'student', 
            class: className, 
            isActive: true 
        }).select('userId name class email');

        res.json(students);

    } catch (error) {
        console.error('Get students error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get All Students (for teacher's classes)
app.get('/api/students', authenticateToken, async (req, res) => {
    try {
        const { classFilter } = req.query;
        let query = { role: 'student', isActive: true };

        if (req.user.role === 'teacher') {
            // Get teacher's classes
            const teacherClasses = await Class.find({ teacher: req.user.userId, isActive: true });
            const classNames = teacherClasses.map(cls => cls.className);
            
            if (classFilter && !classNames.includes(classFilter)) {
                return res.status(403).json({ error: 'Access denied to this class' });
            }
            
            if (classFilter) {
                query.class = classFilter;
            } else {
                query.class = { $in: classNames };
            }
        } else if (classFilter) {
            query.class = classFilter;
        }

        const students = await User.find(query).select('userId name class email createdAt');
        res.json(students);

    } catch (error) {
        console.error('Get all students error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete Student Route
app.delete('/api/students/:studentId', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { studentId } = req.params;

        // If teacher, verify they have access to this student
        if (req.user.role === 'teacher') {
            const student = await User.findOne({ userId: studentId, role: 'student' });
            if (!student) {
                return res.status(404).json({ error: 'Student not found' });
            }

            const hasAccess = await Class.findOne({ 
                teacher: req.user.userId, 
                students: studentId 
            });
            
            if (!hasAccess) {
                return res.status(403).json({ error: 'You do not have access to this student' });
            }
        }

        // Soft delete - mark as inactive
        const deletedUser = await User.findOneAndUpdate(
            { userId: studentId, role: 'student' },
            { isActive: false },
            { new: true }
        );

        if (!deletedUser) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Remove from all classes
        await Class.updateMany(
            { students: studentId },
            { $pull: { students: studentId } }
        );

        res.json({ message: 'Student deleted successfully' });

    } catch (error) {
        console.error('Delete student error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get All Classes (Enhanced)
app.get('/api/classes', authenticateToken, async (req, res) => {
    try {
        let query = { isActive: true };
        
        // Teachers only see their own classes
        if (req.user.role === 'teacher') {
            query.teacher = req.user.userId;
        }

        const classes = await Class.find(query);
        res.json(classes);

    } catch (error) {
        console.error('Get classes error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create Class (Enhanced)
app.post('/api/classes', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { className, teacher, subjects } = req.body;

        // Teachers can only create classes for themselves
        const assignedTeacher = req.user.role === 'teacher' ? req.user.userId : teacher;

        // Check if class name already exists
        const existingClass = await Class.findOne({ className });
        if (existingClass) {
            return res.status(400).json({ error: 'Class name already exists' });
        }

        const subjectsArray = Array.isArray(subjects) ? subjects : subjects.split(',').map(s => s.trim());

        const newClass = new Class({
            className,
            teacher: assignedTeacher,
            subjects: subjectsArray,
            students: []
        });

        await newClass.save();
        res.status(201).json({ message: 'Class created successfully', class: newClass });

    } catch (error) {
        console.error('Create class error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete Class Route
app.delete('/api/classes/:classId', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { classId } = req.params;

        // Teachers can only delete their own classes
        let query = { _id: classId };
        if (req.user.role === 'teacher') {
            query.teacher = req.user.userId;
        }

        const classDoc = await Class.findOne(query);
        if (!classDoc) {
            return res.status(404).json({ error: 'Class not found or access denied' });
        }

        // Soft delete
        await Class.findByIdAndUpdate(classId, { isActive: false });

        res.json({ message: 'Class deleted successfully' });

    } catch (error) {
        console.error('Delete class error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get Attendance Records (Enhanced)
app.get('/api/attendance', authenticateToken, async (req, res) => {
    try {
        const { class: className, date, studentId, markedBy } = req.query;
        
        let query = {};
        
        if (className) query.class = className;
        if (date) query.date = new Date(date);
        if (studentId) query.studentId = studentId;
        if (markedBy) query.markedBy = markedBy;

        // Apply access control
        if (req.user.role === 'teacher') {
            // Teachers can only see attendance they marked or for their classes
            const teacherClasses = await Class.find({ teacher: req.user.userId }).select('className');
            const classNames = teacherClasses.map(cls => cls.className);
            
            if (className && !classNames.includes(className)) {
                return res.status(403).json({ error: 'Access denied to this class' });
            }
            
            if (!className) {
                query.class = { $in: classNames };
            }
        } else if (req.user.role === 'student') {
            // Students can only see their own attendance
            query.studentId = req.user.userId;
        }

        const attendance = await Attendance.find(query).sort({ date: -1, studentName: 1 });
        
        res.json(attendance);

    } catch (error) {
        console.error('Get attendance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get Reports (Enhanced)
app.get('/api/reports/attendance', authenticateToken, async (req, res) => {
    try {
        if (req.user.role === 'student') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { startDate, endDate, className, reportType } = req.query;
        
        let query = {};
        if (startDate && endDate) {
            query.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }
        if (className) query.class = className;

        // Apply access control for teachers
        if (req.user.role === 'teacher') {
            const teacherClasses = await Class.find({ teacher: req.user.userId }).select('className');
            const classNames = teacherClasses.map(cls => cls.className);
            
            if (className && !classNames.includes(className)) {
                return res.status(403).json({ error: 'Access denied to this class' });
            }
            
            if (!className) {
                query.class = { $in: classNames };
            }
        }

        const attendanceData = await Attendance.aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$studentId',
                    studentName: { $first: '$studentName' },
                    class: { $first: '$class' },
                    totalDays: { $sum: 1 },
                    presentDays: {
                        $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] }
                    },
                    absentDays: {
                        $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] }
                    },
                    lateDays: {
                        $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] }
                    }
                }
            },
            {
                $addFields: {
                    attendancePercentage: {
                        $multiply: [
                            { $divide: ['$presentDays', '$totalDays'] },
                            100
                        ]
                    }
                }
            },
            { $sort: { studentName: 1 } }
        ]);

        res.json(attendanceData);

    } catch (error) {
        console.error('Get reports error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Teacher Reports - Own Attendance
app.get('/api/reports/teacher-attendance', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { startDate, endDate, teacherId } = req.query;
        const queryTeacherId = teacherId || req.user.userId;

        // Teachers can only see their own reports
        if (req.user.role === 'teacher' && req.user.userId !== queryTeacherId) {
            return res.status(403).json({ error: 'You can only view your own reports' });
        }

        let query = { teacherId: queryTeacherId };
        if (startDate && endDate) {
            query.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const attendance = await TeacherAttendance.find(query).sort({ date: -1 });
        
        // Calculate statistics
        const totalDays = attendance.length;
        const presentDays = attendance.filter(record => record.status === 'present').length;
        const absentDays = attendance.filter(record => record.status === 'absent').length;
        const lateDays = attendance.filter(record => record.status === 'late').length;
        const attendancePercentage = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

        res.json({
            attendance,
            stats: {
                totalDays,
                presentDays,
                absentDays,
                lateDays,
                attendancePercentage: attendancePercentage.toFixed(2)
            }
        });

    } catch (error) {
        console.error('Get teacher reports error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Seed data function (Enhanced)
async function seedDatabase() {
    try {
        // Check if admin exists
        const adminExists = await User.findOne({ role: 'admin' });
        
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            const admin = new User({
                userId: 'admin',
                password: hashedPassword,
                role: 'admin',
                name: 'System Administrator',
                email: 'admin@school.com'
            });
            await admin.save();
            console.log('Default admin created: admin/admin123');
        }

        // Create sample teachers
        const teacherExists = await User.findOne({ userId: 'teacher1' });
        if (!teacherExists) {
            const teachers = [
                { userId: 'teacher1', name: 'राम प्रकाश शर्मा', subject: 'Mathematics' },
                { userId: 'teacher2', name: 'सुनीता देवी', subject: 'Science' },
                { userId: 'teacher3', name: 'अजय कुमार', subject: 'Hindi' }
            ];

            for (let teacherData of teachers) {
                const hashedPassword = await bcrypt.hash('teacher123', 10);
                const teacher = new User({
                    ...teacherData,
                    password: hashedPassword,
                    role: 'teacher',
                    email: `${teacherData.userId}@school.com`
                });
                await teacher.save();
            }
            console.log('Sample teachers created with password: teacher123');
        }

        // Create sample students
        const studentExists = await User.findOne({ userId: 'student1' });
        if (!studentExists) {
            const students = [
                { userId: 'student1', name: 'अमित कुमार', class: 'Class-10' },
                { userId: 'student2', name: 'सुनीता देवी', class: 'Class-10' },
                { userId: 'student3', name: 'राहुल सिंह', class: 'Class-10' },
                { userId: 'student4', name: 'प्रिया शर्मा', class: 'Class-9' },
                { userId: 'student5', name: 'विकास गुप्ता', class: 'Class-9' }
            ];

            for (let studentData of students) {
                const hashedPassword = await bcrypt.hash('student123', 10);
                const student = new User({
                    ...studentData,
                    password: hashedPassword,
                    role: 'student',
                    email: `${studentData.userId}@school.com`
                });
                await student.save();
            }
            console.log('Sample students created with password: student123');
        }

        // Create sample classes
        const classExists = await Class.findOne({ className: 'Class-10' });
        if (!classExists) {
            const classes = [
                {
                    className: 'Class-10',
                    teacher: 'teacher1',
                    subjects: ['Mathematics', 'Science', 'Hindi', 'English'],
                    students: ['student1', 'student2', 'student3']
                },
                {
                    className: 'Class-9',
                    teacher: 'teacher2',
                    subjects: ['Mathematics', 'Science', 'Hindi', 'English'],
                    students: ['student4', 'student5']
                }
            ];

            for (let classData of classes) {
                const newClass = new Class(classData);
                await newClass.save();
            }
            console.log('Sample classes created');
        }

        // Create sample attendance records
        const attendanceExists = await Attendance.findOne({});
        if (!attendanceExists) {
            const today = new Date();
            const sampleAttendance = [];
            
            // Create attendance for last 5 days
            for (let i = 0; i < 5; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                
                const students = ['student1', 'student2', 'student3'];
                students.forEach(studentId => {
                    sampleAttendance.push({
                        studentId: studentId,
                        studentName: studentId === 'student1' ? 'अमित कुमार' : 
                                   studentId === 'student2' ? 'सुनीता देवी' : 'राहुल सिंह',
                        class: 'Class-10',
                        date: date,
                        status: Math.random() > 0.2 ? 'present' : 'absent', // 80% attendance rate
                        markedBy: 'teacher1',
                        subject: 'Mathematics'
                    });
                });
            }

            await Attendance.insertMany(sampleAttendance);
            console.log('Sample attendance records created');
        }

        // Create sample teacher attendance
        const teacherAttendanceExists = await TeacherAttendance.findOne({});
        if (!teacherAttendanceExists) {
            const today = new Date();
            const sampleTeacherAttendance = [];
            
            // Create teacher attendance for last 10 days
            for (let i = 0; i < 10; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                
                const teachers = [
                    { id: 'teacher1', name: 'राम प्रकाश शर्मा' },
                    { id: 'teacher2', name: 'सुनीता देवी' },
                    { id: 'teacher3', name: 'अजय कुमार' }
                ];
                
                teachers.forEach(teacher => {
                    sampleTeacherAttendance.push({
                        teacherId: teacher.id,
                        teacherName: teacher.name,
                        date: date,
                        status: Math.random() > 0.1 ? 'present' : 'absent', // 90% attendance rate
                        notes: i === 0 && teacher.id === 'teacher1' ? 'Late due to transport issue' : ''
                    });
                });
            }

            await TeacherAttendance.insertMany(sampleTeacherAttendance);
            console.log('Sample teacher attendance records created');
        }

    } catch (error) {
        console.error('Database seeding error:', error);
    }
}

// Get All Teachers Route
app.get('/api/teachers', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const teachers = await User.find({ 
            role: 'teacher', 
            isActive: true 
        }).select('userId name subject email createdAt');

        res.json(teachers);

    } catch (error) {
        console.error('Get teachers error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete Teacher Route
app.delete('/api/teachers/:teacherId', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only admin can delete teachers' });
        }

        const { teacherId } = req.params;

        // Soft delete - mark as inactive
        const deletedTeacher = await User.findOneAndUpdate(
            { userId: teacherId, role: 'teacher' },
            { isActive: false },
            { new: true }
        );

        if (!deletedTeacher) {
            return res.status(404).json({ error: 'Teacher not found' });
        }

        // Update classes to mark them as inactive (optional: reassign to another teacher)
        await Class.updateMany(
            { teacher: teacherId },
            { isActive: false }
        );

        res.json({ message: 'Teacher deleted successfully' });

    } catch (error) {
        console.error('Delete teacher error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update User Profile Route
app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const { name, email, currentPassword, newPassword } = req.body;
        const userId = req.user.userId;

        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prepare update object
        const updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;

        // Handle password change
        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ error: 'Current password required for password change' });
            }

            const isValidPassword = await bcrypt.compare(currentPassword, user.password);
            if (!isValidPassword) {
                return res.status(401).json({ error: 'Invalid current password' });
            }

            const saltRounds = 10;
            updateData.password = await bcrypt.hash(newPassword, saltRounds);
        }

        const updatedUser = await User.findOneAndUpdate(
            { userId },
            updateData,
            { new: true }
        ).select('-password');

        res.json({
            message: 'Profile updated successfully',
            user: updatedUser
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Bulk Mark Attendance Route
app.post('/api/attendance/bulk-mark', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'teacher') {
            return res.status(403).json({ error: 'Only teachers can mark attendance' });
        }

        const { attendanceData } = req.body; // Array of attendance records
        
        if (!Array.isArray(attendanceData) || attendanceData.length === 0) {
            return res.status(400).json({ error: 'Invalid attendance data' });
        }

        const processedRecords = [];

        for (let record of attendanceData) {
            const { studentId, date, status, subject, class: className } = record;

            // Verify teacher has access to this class
            const classDoc = await Class.findOne({ className, teacher: req.user.userId });
            if (!classDoc) {
                continue; // Skip records for classes teacher doesn't have access to
            }

            // Get student details
            const student = await User.findOne({ userId: studentId, role: 'student' });
            if (!student) {
                continue; // Skip if student not found
            }

            // Delete existing attendance for this date, student, and subject
            await Attendance.deleteMany({ 
                studentId,
                date: new Date(date),
                subject: subject,
                class: className
            });

            // Create new attendance record
            const attendanceRecord = new Attendance({
                studentId,
                studentName: student.name,
                class: className,
                date: new Date(date),
                status,
                markedBy: req.user.userId,
                subject
            });

            await attendanceRecord.save();
            processedRecords.push(attendanceRecord);
        }

        res.json({ 
            message: `${processedRecords.length} attendance records processed successfully`,
            records: processedRecords.length
        });

    } catch (error) {
        console.error('Bulk mark attendance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get Class Statistics Route
app.get('/api/classes/:className/stats', authenticateToken, async (req, res) => {
    try {
        const { className } = req.params;
        const { startDate, endDate } = req.query;

        // Check access permissions
        if (req.user.role === 'teacher') {
            const classDoc = await Class.findOne({ className, teacher: req.user.userId });
            if (!classDoc) {
                return res.status(403).json({ error: 'You do not have access to this class' });
            }
        }

        let dateQuery = {};
        if (startDate && endDate) {
            dateQuery = {
                date: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        }

        // Get class details
        const classDoc = await Class.findOne({ className });
        if (!classDoc) {
            return res.status(404).json({ error: 'Class not found' });
        }

        // Get attendance statistics
        const attendanceStats = await Attendance.aggregate([
            {
                $match: {
                    class: className,
                    ...dateQuery
                }
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Get student-wise attendance
        const studentStats = await Attendance.aggregate([
            {
                $match: {
                    class: className,
                    ...dateQuery
                }
            },
            {
                $group: {
                    _id: '$studentId',
                    studentName: { $first: '$studentName' },
                    totalDays: { $sum: 1 },
                    presentDays: {
                        $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] }
                    },
                    absentDays: {
                        $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] }
                    },
                    lateDays: {
                        $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] }
                    }
                }
            },
            {
                $addFields: {
                    attendancePercentage: {
                        $multiply: [
                            { $divide: ['$presentDays', '$totalDays'] },
                            100
                        ]
                    }
                }
            },
            { $sort: { studentName: 1 } }
        ]);

        // Format overall statistics
        const overallStats = {
            present: 0,
            absent: 0,
            late: 0
        };

        attendanceStats.forEach(stat => {
            overallStats[stat._id] = stat.count;
        });

        const totalRecords = overallStats.present + overallStats.absent + overallStats.late;
        const overallAttendancePercentage = totalRecords > 0 ? 
            ((overallStats.present / totalRecords) * 100).toFixed(2) : 0;

        res.json({
            className,
            totalStudents: classDoc.students.length,
            subjects: classDoc.subjects,
            overallStats: {
                ...overallStats,
                total: totalRecords,
                attendancePercentage: overallAttendancePercentage
            },
            studentStats
        });

    } catch (error) {
        console.error('Get class statistics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Export Attendance Data Route
app.get('/api/attendance/export', authenticateToken, async (req, res) => {
    try {
        if (req.user.role === 'student') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { format, startDate, endDate, className } = req.query;

        let query = {};
        if (startDate && endDate) {
            query.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }
        if (className) query.class = className;

        // Apply access control for teachers
        if (req.user.role === 'teacher') {
            const teacherClasses = await Class.find({ teacher: req.user.userId }).select('className');
            const classNames = teacherClasses.map(cls => cls.className);
            
            if (className && !classNames.includes(className)) {
                return res.status(403).json({ error: 'Access denied to this class' });
            }
            
            if (!className) {
                query.class = { $in: classNames };
            }
        }

        const attendanceData = await Attendance.find(query)
            .sort({ date: -1, class: 1, studentName: 1 });

        if (format === 'csv') {
            // Convert to CSV format
            const csvHeader = 'Date,Student ID,Student Name,Class,Status,Subject,Marked By\n';
            const csvData = attendanceData.map(record => {
                return [
                    record.date.toISOString().split('T')[0],
                    record.studentId,
                    record.studentName,
                    record.class,
                    record.status,
                    record.subject || '',
                    record.markedBy
                ].join(',');
            }).join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=attendance_export.csv');
            res.send(csvHeader + csvData);
        } else {
            // Return JSON format
            res.json(attendanceData);
        }

    } catch (error) {
        console.error('Export attendance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get System Statistics (Admin only)
app.get('/api/admin/statistics', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const [
            totalStudents,
            totalTeachers,
            totalClasses,
            activeStudents,
            activeTeachers,
            activeClasses,
            todayAttendance,
            thisWeekAttendance,
            thisMonthAttendance
        ] = await Promise.all([
            User.countDocuments({ role: 'student' }),
            User.countDocuments({ role: 'teacher' }),
            Class.countDocuments({}),
            User.countDocuments({ role: 'student', isActive: true }),
            User.countDocuments({ role: 'teacher', isActive: true }),
            Class.countDocuments({ isActive: true }),
            Attendance.countDocuments({ 
                date: { 
                    $gte: new Date(new Date().setHours(0, 0, 0, 0)) 
                } 
            }),
            Attendance.countDocuments({ 
                date: { 
                    $gte: new Date(new Date().setDate(new Date().getDate() - 7)) 
                } 
            }),
            Attendance.countDocuments({ 
                date: { 
                    $gte: new Date(new Date().setDate(new Date().getDate() - 30)) 
                } 
            })
        ]);

        // Get attendance trends for the last 7 days
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            
            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);
            
            const dayAttendance = await Attendance.countDocuments({
                date: { $gte: date, $lt: nextDate }
            });
            
            last7Days.push({
                date: date.toISOString().split('T')[0],
                attendance: dayAttendance
            });
        }

        res.json({
            totals: {
                students: totalStudents,
                teachers: totalTeachers,
                classes: totalClasses
            },
            active: {
                students: activeStudents,
                teachers: activeTeachers,
                classes: activeClasses
            },
            attendance: {
                today: todayAttendance,
                thisWeek: thisWeekAttendance,
                thisMonth: thisMonthAttendance
            },
            trends: {
                last7Days
            }
        });

    } catch (error) {
        console.error('Get system statistics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health Check Route
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Get all notices (with filters)
app.get('/api/notices', authenticateToken, async (req, res) => {
    try {
        const { targetClass, type, active = 'true' } = req.query;
        let query = { isActive: active === 'true' };
        
        if (req.user.role === 'student') {
            // Students see notices for their class or general notices
            query.$or = [
                { targetClass: req.user.class },
                { targetClass: { $exists: false } },
                { targetClass: '' }
            ];
            query.targetRole = { $in: ['student', 'all'] };
        } else if (req.user.role === 'teacher') {
            // Teachers see notices for their classes or general notices
            const teacherClasses = await Class.find({ teacher: req.user.userId }).select('className');
            const classNames = teacherClasses.map(cls => cls.className);
            
            if (targetClass && !classNames.includes(targetClass)) {
                return res.status(403).json({ error: 'Access denied to this class' });
            }
            
            if (targetClass) {
                query.targetClass = targetClass;
            }
        }
        
        if (type) query.type = type;
        
        const notices = await Notice.find(query).sort({ createdAt: -1 }).limit(50);
        res.json(notices);
        
    } catch (error) {
        console.error('Get notices error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create new notice
app.post('/api/notices', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only teachers and admins can create notices' });
        }
        
        const { title, content, type, targetClass, targetRole, priority, expiryDate } = req.body;
        
        // Verify teacher has access to target class
        if (req.user.role === 'teacher' && targetClass) {
            const hasAccess = await Class.findOne({ className: targetClass, teacher: req.user.userId });
            if (!hasAccess) {
                return res.status(403).json({ error: 'You do not have access to this class' });
            }
        }
        
        const notice = new Notice({
            title,
            content,
            type,
            postedBy: req.user.userId,
            postedByName: req.user.name,
            targetClass: targetClass || '',
            targetRole: targetRole || 'student',
            priority: priority || 'medium',
            expiryDate: expiryDate ? new Date(expiryDate) : null
        });
        
        await notice.save();
        res.status(201).json({ message: 'Notice created successfully', notice });
        
    } catch (error) {
        console.error('Create notice error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update notice
app.put('/api/notices/:noticeId', authenticateToken, async (req, res) => {
    try {
        const { noticeId } = req.params;
        const { title, content, type, targetClass, priority, expiryDate, isActive } = req.body;
        
        const notice = await Notice.findById(noticeId);
        if (!notice) {
            return res.status(404).json({ error: 'Notice not found' });
        }
        
        // Only the poster or admin can update
        if (req.user.role !== 'admin' && notice.postedBy !== req.user.userId) {
            return res.status(403).json({ error: 'You can only update your own notices' });
        }
        
        const updateData = { title, content, type, priority, isActive };
        if (expiryDate) updateData.expiryDate = new Date(expiryDate);
        if (targetClass !== undefined) updateData.targetClass = targetClass;
        
        const updatedNotice = await Notice.findByIdAndUpdate(noticeId, updateData, { new: true });
        res.json({ message: 'Notice updated successfully', notice: updatedNotice });
        
    } catch (error) {
        console.error('Update notice error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete notice
app.delete('/api/notices/:noticeId', authenticateToken, async (req, res) => {
    try {
        const { noticeId } = req.params;
        
        const notice = await Notice.findById(noticeId);
        if (!notice) {
            return res.status(404).json({ error: 'Notice not found' });
        }
        
        // Only the poster or admin can delete
        if (req.user.role !== 'admin' && notice.postedBy !== req.user.userId) {
            return res.status(403).json({ error: 'You can only delete your own notices' });
        }
        
        await Notice.findByIdAndUpdate(noticeId, { isActive: false });
        res.json({ message: 'Notice deleted successfully' });
        
    } catch (error) {
        console.error('Delete notice error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// 404 Handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// 404 Handler for other routes
app.use('*', (req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server and seed database
const PORT = process.env.PORT || 3000;

mongoose.connection.once('open', async () => {
    await seedDatabase();
    
    app.listen(PORT, () => {
        console.log(`
╔══════════════════════════════════════════════════════╗
║            🎓 RURAL SCHOOL ATTENDANCE SYSTEM         ║
║                                                      ║
║  Server running on: http://localhost:${PORT}          ║
║                                                      ║
║  Default Login Credentials:                          ║
║  👨‍💼 Admin:    admin/admin123                         ║
║  👨‍🏫 Teacher:  teacher1/teacher123                   ║
║  👨‍🎓 Student:  student1/student123                   ║
║                                                      ║
║  API Endpoints:                                      ║
║  📊 Dashboard: /api/dashboard                        ║
║  🔐 Login:     /api/login                            ║
║  📝 Register:  /api/register                         ║
║  📈 Reports:   /api/reports/attendance               ║
║  🏛️  Classes:   /api/classes                          ║
║  👥 Students:  /api/students                         ║
║  📋 Mark Att:  /api/attendance/mark                  ║
║                                                      ║
║  🌐 Web Interface: http://localhost:${PORT}           ║
║  👨‍🏫 Teacher Panel: http://localhost:${PORT}/teacher   ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
        `);
    });
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n📋 Shutting down server gracefully...');
    
    try {
        await mongoose.connection.close();
        console.log('📦 MongoDB connection closed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

module.exports = app;