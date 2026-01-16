# Automated Attendance System - Setup Guide

A comprehensive attendance management system designed for rural schools with multilingual support (English/Hindi).

## 👥 Project Type - **Group Project**
## 👤 Team Members
- Yashvi lakhiwal
- Palak kaushik
- Shatakshi singh
- Ravleen kaur
## 📋 Prerequisites

Before you begin, ensure you have the following installed on your system:

- *Node.js* (version 14 or higher) - [Download from nodejs.org](https://nodejs.org/)
- *MongoDB* - [Download from mongodb.com](https://www.mongodb.com/try/download/community)
- *Git* (optional, for version control)

## 🚀 Installation Steps

### 1. Create Project Directory
bash
mkdir attendance-system
cd attendance-system


### 2. Create File Structure
Create the following folder structure:

attendance-system/
├── server.js
├── package.json
├── .env
├── .gitignore
└── public/
    └── index.html


### 3. Save the Files

Save the provided files in the following locations:

- *server.js* - Main backend server file (root directory)
- *package.json* - Dependencies configuration (root directory)
- *.env* - Environment variables (root directory)
- *public/index.html* - Frontend HTML file (inside public folder)

### 4. Install Dependencies

Run the following command in your project root directory:

bash
npm install


This will install all required packages:
- express
- mongoose
- bcryptjs
- jsonwebtoken
- cors
- dotenv

For development, also install nodemon (optional but recommended):
bash
npm install -D nodemon


### 5. Setup MongoDB

#### Option A: Local MongoDB Installation
1. Install MongoDB Community Edition
2. Start MongoDB service:
   bash
   # On Windows
   net start MongoDB
   
   # On macOS
   brew services start mongodb/brew/mongodb-community
   
   # On Linux
   sudo systemctl start mongod
   

#### Option B: MongoDB Atlas (Cloud - Recommended)
1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a free account
3. Create a new cluster
4. Get your connection string
5. Update the .env file with your connection string:
   
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/attendance_system
   

### 6. Configure Environment Variables

Update the .env file with your settings:
env
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/attendance_system

# JWT Secret (IMPORTANT: Change this in production!)
JWT_SECRET=your_super_secure_jwt_secret_key_change_this_in_production

# Server Port
PORT=3000

# Environment
NODE_ENV=development


### 7. Create .gitignore File

Create a .gitignore file to exclude sensitive files:
gitignore
node_modules/
.env
.DS_Store
*.log


## 🏃‍♂ Running the Application

### Development Mode
bash
npm run dev


### Production Mode
bash
npm start


The application will be available at: http://localhost:3000

## 👥 Default Login Credentials

The system automatically creates default accounts on first run:

### Admin Account
- *Username:* admin
- *Password:* admin123
- *Role:* Administrator

### Teacher Account
- *Username:* teacher1
- *Password:* teacher123
- *Role:* Teacher

### Student Accounts
- *Username:* student1, student2, student3
- *Password:* student123
- *Role:* Student

## 🎯 Features

### For Students
- View personal attendance records
- Check attendance percentage
- Multilingual interface (English/Hindi)

### For Teachers
- Mark student attendance
- View class rosters
- Generate attendance reports

### For Administrators
- Manage users (students, teachers)
- Create and manage classes
- View system-wide statistics
- Generate comprehensive reports

## 📱 Usage Instructions

1. *Language Selection*: Choose English or Hindi on the welcome screen
2. *Role Selection*: Select your role (Student/Teacher/Admin)
3. *Login*: Enter your credentials
4. *Dashboard*: Access role-specific features

## 🔧 API Endpoints

### Authentication
- POST /api/login - User login
- POST /api/register - Create new user (admin only)

### Dashboard
- GET /api/dashboard - Get role-specific dashboard data

### Attendance
- POST /api/attendance/mark - Mark attendance (teachers only)
- GET /api/attendance - Get attendance records
- GET /api/reports/attendance - Generate attendance reports

### User Management
- GET /api/students/:className - Get students by class
- GET /api/classes - Get all classes
- POST /api/classes - Create new class (admin only)

## 🛠 Customization

### Adding New Languages
1. Update the translations object in index.html
2. Add language-specific placeholders
3. Update the language selection buttons

### Database Schema
The system uses three main collections:
- *users* - Student, teacher, and admin accounts
- *attendance* - Daily attendance records
- *classes* - Class information and student assignments

### Styling
Modify the CSS in index.html to customize the appearance:
- Colors: Update the gradient and color variables
- Layout: Modify the container and form styles
- Responsive design: Adjust media queries for mobile devices

## 🔒 Security Notes

1. *Change default passwords* in production
2. *Update JWT_SECRET* to a secure random string
3. *Use HTTPS* in production
4. *Implement rate limiting* for API endpoints
5. *Validate input data* on both client and server sides

## 📊 Database Backup

### Backup MongoDB
bash
mongodump --db attendance_system --out ./backup


### Restore MongoDB
bash
mongorestore --db attendance_system ./backup/attendance_system


## 🚀 Deployment

### Local Network Deployment
1. Update the .env file with your server's IP
2. Ensure MongoDB is accessible from other devices
3. Start the server: npm start

### Cloud Deployment (Heroku Example)
1. Install Heroku CLI
2. Create Heroku app: heroku create your-app-name
3. Set environment variables: heroku config:set MONGODB_URI=your_connection_string
4. Deploy: git push heroku main

## 🐛 Troubleshooting

### Common Issues

*MongoDB Connection Failed*
- Check if MongoDB service is running
- Verify connection string in .env
- Check network connectivity for MongoDB Atlas

*Port Already in Use*
- Change the PORT in .env file
- Kill the process using the port: lsof -ti:3000 | xargs kill

*Login Issues*
- Verify default credentials
- Check database connection
- Clear browser cache and try again

*API Errors*
- Check browser console for error messages
- Verify network connectivity
- Check server logs for detailed error information

## 🤝 Support

For issues or questions:
1. Check the troubleshooting section
2. Review server logs for error details
3. Ensure all dependencies are properly installed
4. Verify database connectivity

## 📈 Future Enhancements

- Mobile app development
- SMS notifications for parents
- Biometric attendance integration
- Advanced reporting and analytics
- Parent portal access
- Integration with school management systems

---

*Made with ❤ for Rural Education*
