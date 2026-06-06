export enum SubscriptionState {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  EXPIRED = 'EXPIRED',
}

export enum FeatureState {
  UNAVAILABLE = 'UNAVAILABLE',
  AVAILABLE = 'AVAILABLE',
  ACTIVE = 'ACTIVE',
}

export enum StaffRole {
  SCHOOL_OWNER = 'SCHOOL_OWNER',
  SCHOOL_ADMIN = 'SCHOOL_ADMIN',
  TEACHER = 'TEACHER',
  ACCOUNTANT = 'ACCOUNTANT',
  TRANSPORT_OFFICER = 'TRANSPORT_OFFICER',
}

export enum PermissionAction {
  VIEW = 'VIEW',
  CREATE = 'CREATE',
  EDIT = 'EDIT',
  DELETE = 'DELETE',
}

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  EXCUSED = 'EXCUSED',
}

export enum DailyFeeStatus {
  PAID = 'PAID',
  PRE_COVERED = 'PRE_COVERED',
  ABSENT = 'ABSENT',
  UNPAID = 'UNPAID',
}

export enum AdmissionStage {
  LEAD = 'LEAD',
  INQUIRY = 'INQUIRY',
  APPLICATION = 'APPLICATION',
  INTERVIEW = 'INTERVIEW',
  ACCEPTED = 'ACCEPTED',
  ENROLLED = 'ENROLLED',
  WITHDRAWN = 'WITHDRAWN',
}
