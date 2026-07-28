"use client";

import { use, useEffect, useState, type JSX } from "react";
import Link from "next/link";
import { ArrowLeft, FileX2, RefreshCw } from "lucide-react";

import { getWalletDiploma, listShareLinks } from "@/lib/api/endpoints";
import { ApiClientError, apiErrorMessage } from "@/lib/api/client";
import type { ShareLinkDTO, WalletDiplomaDTO } from "@certifychain/contract/dto";
import {
  Button,
  EmptyState,
  Skeleton,
  SkeletonText,
  useToast,
} from "@certifychain/shared/ui";
import { DiplomaDetailCard } from "@/components/wallet/DiplomaDetailCard";
import { EudiExportAction } from "@/components/wallet/EudiExportAction";
import { SharePanel } from "@/components/wallet/SharePanel";

interface PageProps {
  params: Promise<{ id: string }>;
}

type LoadState =
  | { status: "loading" }
  | {
      status: "ready";
      diploma: WalletDiplomaDTO;
      shareLinks: ShareLinkDTO[];
    }
  | { status: "error"; message: string; notFound: boolean };

function DetailSkeleton(): JSX.Element {
  return (
    <div className="grid gap-8 lg:grid-cols-2 items-start">
      <div className="glass rounded-[1.75rem] p-8">
        <div className="flex items-center gap-3">
          <Skeleton className="w-11 h-11 rounded-2xl" />
          <div className="flex-1">
            <SkeletonText lines={2} />
          </div>
        </div>
        <Skeleton className="mt-6 h-44 rounded-2xl" />
      </div>
      <div className="glass rounded-[1.75rem] p-7">
        <SkeletonText lines={2} />
        <Skeleton className="mt-6 h-11 rounded-xl" />
        <Skeleton className="mt-4 h-11 rounded-full" />
        <Skeleton className="mt-6 h-36 rounded-2xl" />
      </div>
    </div>
  );
}

export default function WalletDiplomaPage({ params }: PageProps): JSX.Element {
  const { id } = use(params);
  const toast = useToast();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });

    Promise.all([getWalletDiploma(id), listShareLinks(id)])
      .then(([diploma, shareLinkList]) => {
        if (active) setState({ status: "ready", diploma, shareLinks: shareLinkList.items });
      })
      .catch((err: unknown) => {
        if (!active) return;
        const notFound = err instanceof ApiClientError && err.status === 404;
        const message = apiErrorMessage(err, "Impossible de charger ce diplôme.");
        setState({ status: "error", message, notFound });
        if (!notFound) toast.error("Chargement impossible", message);
      });

    return () => {
      active = false;
    };
  }, [id, reloadKey, toast]);

  return (
    <div className="flex flex-col gap-7">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour au portefeuille
      </Link>

      {state.status === "loading" && <DetailSkeleton />}

      {state.status === "error" && (
        <div className="glass rounded-[1.75rem]">
          <EmptyState
            icon={<FileX2 />}
            title={
              state.notFound ? "Diplôme introuvable" : "Une erreur est survenue"
            }
            description={
              state.notFound
                ? "Ce diplôme n'existe pas ou ne vous appartient pas."
                : state.message
            }
            action={
              state.notFound ? (
                <Button as="a" href="/" variant="ghost">
                  Retour au portefeuille
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                  onClick={() => setReloadKey((k) => k + 1)}
                >
                  Réessayer
                </Button>
              )
            }
          />
        </div>
      )}

      {state.status === "ready" && (
        <div className="grid gap-8 lg:grid-cols-2 items-start">
          <div className="flex flex-col gap-5">
            <DiplomaDetailCard diploma={state.diploma} />
            <EudiExportAction
              diplomaId={state.diploma.id}
              available={state.diploma.eudiExportAvailable}
            />
          </div>
          <SharePanel diplomaId={state.diploma.id} initialLinks={state.shareLinks} />
        </div>
      )}
    </div>
  );
}
