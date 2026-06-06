'use client';

import { useCallback } from 'react';
import { staffApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { useStaffAuth } from '@/contexts/staff-auth';

// ── Types ─────────────────────────────────────────────────────────────────────

export type MyClassAssignment = {
  id: string;
  classId: string;
  class: { id: string; name: string };
};

export type MySubjectAssignment = {
  id: string;
  classId: string;
  subjectId: string;
  subject: { id: string; name: string };
  class: { id: string; name: string };
};

type RawAssignments = {
  classAssignments: MyClassAssignment[];
  subjectAssignments: MySubjectAssignment[];
};

export type TeacherScope = {
  /** True while assignments are being fetched for a restricted teacher */
  loading: boolean;
  /**
   * True when the logged-in user is a TEACHER without an owner/admin role.
   * When false, no filtering is applied and all helpers return unrestricted values.
   */
  restricted: boolean;
  classAssignments: MyClassAssignment[];
  subjectAssignments: MySubjectAssignment[];
  /** All unique class IDs this teacher is involved with (class teacher + subject teacher) */
  assignedClassIds: string[];
  /** All unique subject IDs this teacher is assigned to teach */
  assignedSubjectIds: string[];
  /** Subject IDs this teacher is assigned to teach in a specific class */
  subjectsForClass: (classId: string) => string[];
  /** True if the teacher holds the class-teacher role for the given class */
  isClassTeacherOf: (classId: string) => boolean;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTeacherScope(): TeacherScope {
  const { hasRole, isOwner, isAdmin } = useStaffAuth();

  // Only restrict when the user is a pure teacher (no elevated role)
  const restricted = hasRole('TEACHER') && !isOwner && !isAdmin;

  const fetch = useCallback(
    () =>
      restricted
        ? staffApi.get<RawAssignments>('/school/staff/me/assignments')
        : Promise.resolve<RawAssignments>({ classAssignments: [], subjectAssignments: [] }),
    [restricted],
  );

  const { data, loading } = useApi(fetch);

  const classAssignments   = data?.classAssignments   ?? [];
  const subjectAssignments = data?.subjectAssignments ?? [];

  // Unique class IDs from both class-teacher and subject-teacher roles
  const assignedClassIds = [
    ...new Set([
      ...classAssignments.map(a => a.classId),
      ...subjectAssignments.map(a => a.classId),
    ]),
  ];

  const assignedSubjectIds = [...new Set(subjectAssignments.map(a => a.subjectId))];

  function subjectsForClass(classId: string): string[] {
    return subjectAssignments
      .filter(a => a.classId === classId)
      .map(a => a.subjectId);
  }

  function isClassTeacherOf(classId: string): boolean {
    return classAssignments.some(a => a.classId === classId);
  }

  return {
    loading: restricted && loading,
    restricted,
    classAssignments,
    subjectAssignments,
    assignedClassIds,
    assignedSubjectIds,
    subjectsForClass,
    isClassTeacherOf,
  };
}
