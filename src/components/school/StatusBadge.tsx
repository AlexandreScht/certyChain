import { Badge, type BadgeTone } from "@/components/ui";
import type { DiplomaStatus, SchoolStatus } from "@contract/enums";

const schoolLabels: Record<SchoolStatus, string> = {
  pending: "En attente KYB",
  provisional: "Propriété à vérifier",
  approved: "Validée",
  rejected: "Refusée",
  revoked: "Révoquée",
};

const schoolTones: Record<SchoolStatus, BadgeTone> = {
  pending: "magenta",
  provisional: "cyan",
  approved: "success",
  rejected: "danger",
  revoked: "danger",
};

const diplomaLabels: Record<DiplomaStatus, string> = {
  active: "Actif",
  revoked: "Révoqué",
};

const diplomaTones: Record<DiplomaStatus, BadgeTone> = {
  active: "success",
  revoked: "danger",
};

export interface SchoolStatusBadgeProps {
  status: SchoolStatus;
}

/** School lifecycle badge (pending / approved / rejected / revoked). */
export function SchoolStatusBadge({ status }: SchoolStatusBadgeProps) {
  return (
    <Badge tone={schoolTones[status]} dot pulse={status === "approved"}>
      {schoolLabels[status]}
    </Badge>
  );
}

export interface DiplomaStatusBadgeProps {
  status: DiplomaStatus;
}

/** Diploma lifecycle badge (active / revoked). */
export function DiplomaStatusBadge({ status }: DiplomaStatusBadgeProps) {
  return (
    <Badge tone={diplomaTones[status]} dot>
      {diplomaLabels[status]}
    </Badge>
  );
}
