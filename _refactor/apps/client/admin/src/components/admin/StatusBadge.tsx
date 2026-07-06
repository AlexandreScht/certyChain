import { Badge, type BadgeTone } from "@certifychain/shared/ui";
import type { DiplomaStatus, SchoolStatus } from "@certifychain/contract/enums";

const schoolLabels: Record<SchoolStatus, string> = {
  pending: "En attente",
  provisional: "Vérification propriété",
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

export function SchoolStatusBadge({ status }: { status: SchoolStatus }) {
  return (
    <Badge tone={schoolTones[status]} dot pulse={status === "approved"}>
      {schoolLabels[status]}
    </Badge>
  );
}

export function DiplomaStatusBadge({ status }: { status: DiplomaStatus }) {
  return (
    <Badge tone={diplomaTones[status]} dot>
      {diplomaLabels[status]}
    </Badge>
  );
}
