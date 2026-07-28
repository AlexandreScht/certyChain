"use client";

import { useEffect, useState, type JSX } from "react";
import { GraduationCap, Inbox, RefreshCw } from "lucide-react";

import { getWalletDiplomas } from "@/lib/api/endpoints";
import { apiErrorMessage } from "@/lib/api/client";
import type { WalletDiplomaDTO } from "@certifychain/contract/dto";
import {
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
  SkeletonText,
  useToast,
} from "@certifychain/shared/ui";
import { DiplomaCard } from "@/components/wallet/DiplomaCard";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; diplomas: WalletDiplomaDTO[] }
  | { status: "error"; message: string };

function CardSkeleton(): JSX.Element {
  return (
    <div className="glass rounded-[1.75rem] p-6">
      <div className="flex items-center gap-2.5">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="flex-1">
          <SkeletonText lines={2} />
        </div>
      </div>
      <Skeleton className="mt-5 h-28 rounded-2xl" />
      <Skeleton className="mt-4 h-4 w-2/3 rounded-full" />
    </div>
  );
}

export default function WalletHomePage(): JSX.Element {
  const toast = useToast();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });

    getWalletDiplomas()
      .then((diplomas) => {
        if (active) setState({ status: "ready", diplomas });
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = apiErrorMessage(err, "Impossible de charger vos diplômes.");
        setState({ status: "error", message });
        toast.error("Chargement impossible", message);
      });

    return () => {
      active = false;
    };
  }, [reloadKey, toast]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Mon portefeuille"
        title="Mes"
        gradient="diplômes"
        cool
        subtitle="Consultez vos diplômes numériques certifiés et partagez-les en toute confiance avec un recruteur."
      />

      {state.status === "loading" && (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <EmptyState
          icon={<Inbox />}
          title="Une erreur est survenue"
          description={state.message}
          action={
            <Button
              variant="ghost"
              leftIcon={<RefreshCw className="w-4 h-4" />}
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Réessayer
            </Button>
          }
        />
      )}

      {state.status === "ready" &&
        (state.diplomas.length === 0 ? (
          <div className="glass rounded-[1.75rem]">
            <EmptyState
              icon={<GraduationCap />}
              title="Aucun diplôme pour le moment"
              description="Dès qu'un établissement émettra un diplôme à votre nom, il apparaîtra ici automatiquement."
            />
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {state.diplomas.map((diploma, i) => (
              <DiplomaCard key={diploma.id} diploma={diploma} index={i} />
            ))}
          </div>
        ))}
    </div>
  );
}
