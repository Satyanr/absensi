-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('EMPLOYEE', 'INTERN');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "employment_type" "EmploymentType" NOT NULL DEFAULT 'EMPLOYEE';
