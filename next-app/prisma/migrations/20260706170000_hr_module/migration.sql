-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'PAID_LEAVE', 'SICK_LEAVE', 'WEEKLY_OFF', 'HOLIDAY', 'WFH');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('MANUAL', 'GPS', 'BIOMETRIC', 'QR');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('CASUAL', 'SICK', 'EARNED', 'MATERNITY', 'EMERGENCY', 'LOSS_OF_PAY');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'MANAGER_APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdvanceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PayslipStatus" AS ENUM ('DRAFT', 'FINALIZED', 'PAID');

-- CreateTable
CREATE TABLE "EmployeeProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "photoUrl" TEXT,
    "altPhone" TEXT,
    "dob" TIMESTAMP(3),
    "gender" TEXT,
    "bloodGroup" TEXT,
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "department" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "dateOfJoining" TIMESTAMP(3) NOT NULL,
    "reportingManagerId" TEXT,
    "workLocation" TEXT,
    "status" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "aadhaar" TEXT,
    "pan" TEXT,
    "drivingLicence" TEXT,
    "bankAccount" TEXT,
    "ifsc" TEXT,
    "bankName" TEXT,
    "upiId" TEXT,
    "documents" JSONB,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryStructure" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "basicPaise" INTEGER NOT NULL DEFAULT 0,
    "hraPaise" INTEGER NOT NULL DEFAULT 0,
    "conveyancePaise" INTEGER NOT NULL DEFAULT 0,
    "specialPaise" INTEGER NOT NULL DEFAULT 0,
    "otherEarnPaise" INTEGER NOT NULL DEFAULT 0,
    "ptPaise" INTEGER NOT NULL DEFAULT 0,
    "otherDeductPaise" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "workedMins" INTEGER NOT NULL DEFAULT 0,
    "overtimeMins" INTEGER NOT NULL DEFAULT 0,
    "source" "AttendanceSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "correctedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "attachmentUrl" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "managerId" TEXT,
    "managerAt" TIMESTAMP(3),
    "hrId" TEXT,
    "hrAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "type" "LeaveType" NOT NULL,
    "allotted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "used" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryAdvance" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amountPaise" INTEGER NOT NULL,
    "reason" TEXT,
    "requestedById" TEXT,
    "status" "AdvanceStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvalDate" TIMESTAMP(3),
    "rejectReason" TEXT,
    "recoveryMethod" TEXT NOT NULL DEFAULT 'SALARY',
    "installments" INTEGER NOT NULL DEFAULT 1,
    "installmentPaise" INTEGER NOT NULL DEFAULT 0,
    "recoveredPaise" INTEGER NOT NULL DEFAULT 0,
    "remainingPaise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvanceRecovery" (
    "id" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "payslipId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvanceRecovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "workingDays" INTEGER NOT NULL DEFAULT 0,
    "presentDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidLeaveDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "absentDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeMins" INTEGER NOT NULL DEFAULT 0,
    "basicPaise" INTEGER NOT NULL DEFAULT 0,
    "hraPaise" INTEGER NOT NULL DEFAULT 0,
    "conveyancePaise" INTEGER NOT NULL DEFAULT 0,
    "specialPaise" INTEGER NOT NULL DEFAULT 0,
    "incentivePaise" INTEGER NOT NULL DEFAULT 0,
    "overtimePaise" INTEGER NOT NULL DEFAULT 0,
    "bonusPaise" INTEGER NOT NULL DEFAULT 0,
    "otherEarnPaise" INTEGER NOT NULL DEFAULT 0,
    "advanceRecoverPaise" INTEGER NOT NULL DEFAULT 0,
    "ptPaise" INTEGER NOT NULL DEFAULT 0,
    "otherDeductPaise" INTEGER NOT NULL DEFAULT 0,
    "grossPaise" INTEGER NOT NULL DEFAULT 0,
    "deductionsPaise" INTEGER NOT NULL DEFAULT 0,
    "netPaise" INTEGER NOT NULL DEFAULT 0,
    "status" "PayslipStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedById" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "note" TEXT,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_userId_key" ON "EmployeeProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_employeeCode_key" ON "EmployeeProfile"("employeeCode");

-- CreateIndex
CREATE INDEX "EmployeeProfile_department_status_idx" ON "EmployeeProfile"("department", "status");

-- CreateIndex
CREATE INDEX "EmployeeProfile_deletedAt_idx" ON "EmployeeProfile"("deletedAt");

-- CreateIndex
CREATE INDEX "SalaryStructure_employeeId_effectiveFrom_idx" ON "SalaryStructure"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_employeeId_date_key" ON "Attendance"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveRequest_code_key" ON "LeaveRequest"("code");

-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_status_idx" ON "LeaveRequest"("employeeId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_createdAt_idx" ON "LeaveRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_employeeId_year_type_key" ON "LeaveBalance"("employeeId", "year", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryAdvance_code_key" ON "SalaryAdvance"("code");

-- CreateIndex
CREATE INDEX "SalaryAdvance_employeeId_status_idx" ON "SalaryAdvance"("employeeId", "status");

-- CreateIndex
CREATE INDEX "AdvanceRecovery_advanceId_idx" ON "AdvanceRecovery"("advanceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_code_key" ON "Payslip"("code");

-- CreateIndex
CREATE INDEX "Payslip_month_status_idx" ON "Payslip"("month", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_employeeId_month_key" ON "Payslip"("employeeId", "month");

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_reportingManagerId_fkey" FOREIGN KEY ("reportingManagerId") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryStructure" ADD CONSTRAINT "SalaryStructure_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryAdvance" ADD CONSTRAINT "SalaryAdvance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceRecovery" ADD CONSTRAINT "AdvanceRecovery_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "SalaryAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceRecovery" ADD CONSTRAINT "AdvanceRecovery_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

