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
  classTeacherClassIds?: string[];
  recordableSubjectIds?: string[];
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
  /** Class IDs this teacher is the CLASS TEACHER of — the scope for attendance */
  classTeacherClassIds: string[];
  /** Subject IDs this teacher may record assessments for (subject-teacher subjects
   *  plus every subject of their class-teacher classes) */
  recordableSubjectIds: string[];
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

  // Key on `restricted` so the hook re-fetches when auth resolves and the user
  // is recognised as a restricted teacher. Without this, a hard refresh / direct
  // page load renders first with `restricted === false` (auth not yet loaded),
  // fetches the empty placeholder, and never re-runs when `restricted` flips to
  // true — leaving the teacher with no classes/subjects (no students, no
  // attendance classes, etc.).
  const { data, loading } = useApi(fetch, restricted);

  const classAssignments   = data?.classAssignments   ?? [];
  const subjectAssignments = data?.subjectAssignments ?? [];

  // Unique class IDs from both class-teacher and subject-teacher roles
  const assignedClassIds = [
    ...new Set([
      ...classAssignments.map(a => a.classId),
      ...subjectAssignments.map(a => a.classId),
    ]),
  ];

  // Class-teacher classes (attendance scope). Prefer the server-computed list;
  // fall back to deriving from classAssignments.
  const classTeacherClassIds = data?.classTeacherClassIds
    ?? classAssignments.map(a => a.classId);

  // Subjects the teacher may record (server computes the class-teacher union);
  // fall back to subject-teacher subjects only.
  const assignedSubjectIds = [...new Set(subjectAssignments.map(a => a.subjectId))];
  const recordableSubjectIds = data?.recordableSubjectIds ?? assignedSubjectIds;

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
    classTeacherClassIds,
    recordableSubjectIds,
    assignedSubjectIds,
    subjectsForClass,
    isClassTeacherOf,
  };
}
