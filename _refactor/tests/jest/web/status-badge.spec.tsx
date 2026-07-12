/** Portail école — libellés français des statuts (dont `provisional`). */
import { render, screen } from "@testing-library/react";
import {
  DiplomaStatusBadge,
  SchoolStatusBadge,
} from "../../../apps/client/web/src/components/school/StatusBadge";
import type { DiplomaStatus, SchoolStatus } from "../../../packages/contract/src/enums";

const SCHOOL_LABELS: Record<SchoolStatus, string> = {
  pending: "En attente KYB",
  provisional: "Propriété à vérifier",
  approved: "Validée",
  rejected: "Refusée",
  revoked: "Révoquée",
};

describe("SchoolStatusBadge", () => {
  it.each(Object.entries(SCHOOL_LABELS) as [SchoolStatus, string][])(
    "statut %s → « %s »",
    (status, label) => {
      render(<SchoolStatusBadge status={status} />);
      expect(screen.getByText(label)).toBeTruthy();
    },
  );
});

const DIPLOMA_LABELS: Record<DiplomaStatus, string> = {
  active: "Actif",
  revoked: "Révoqué",
};

describe("DiplomaStatusBadge", () => {
  it.each(Object.entries(DIPLOMA_LABELS) as [DiplomaStatus, string][])(
    "statut %s → « %s »",
    (status, label) => {
      render(<DiplomaStatusBadge status={status} />);
      expect(screen.getByText(label)).toBeTruthy();
    },
  );
});
