"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Board, Id, Member, Request, RequestAction } from "@officehub/shared";
import { getApi, isApiError, type ChangeEvent, type CreateAgentInput, type CreateRequestInput, type RecordDecisionInput, type UpdateStatusInput, type MascotInput } from "./api";

export const qk = {
  me: ["me"] as const,
  board: (slug: string) => ["board", slug] as const,
  requests: (slug: string) => ["requests", slug] as const,
  inbox: (slug: string) => ["inbox", slug] as const,
  decisions: (slug: string) => ["decisions", slug] as const,
  agents: (slug: string) => ["agents", slug] as const,
  handoff: (slug: string, id: string) => ["handoff", slug, id] as const,
};

/** Which queries a server "change" event makes stale. Unknown kinds refresh everything in the workspace. */
export function keysForChange(slug: string, e: ChangeEvent): (readonly unknown[])[] {
  const board = qk.board(slug);
  switch (e.kind) {
    case "member":
      return [board, qk.me];
    case "status":
    case "task":
    case "event":
      return [board];
    case "request":
      return [qk.requests(slug), qk.inbox(slug), board, ["handoff", slug]];
    case "inbox":
      return [qk.inbox(slug), qk.requests(slug), board];
    case "decision":
      return [qk.decisions(slug), board, ["handoff", slug]];
    case "agent":
      return [qk.agents(slug)];
    default:
      return [qk.me, board, qk.requests(slug), qk.inbox(slug), qk.decisions(slug), qk.agents(slug), ["handoff", slug]];
  }
}

export function applyChange(qc: QueryClient, slug: string, e: ChangeEvent) {
  for (const key of keysForChange(slug, e)) void qc.invalidateQueries({ queryKey: key });
}

/** Subscribes to the workspace stream (SSE in http mode, an emitter in mock mode) and refetches affected queries. */
export function useRealtime(slug: string) {
  const qc = useQueryClient();
  useEffect(() => getApi().subscribe(slug, (e) => applyChange(qc, slug, e)), [qc, slug]);
}

const noRetryOnClientError = (count: number, e: unknown) => !(isApiError(e) && e.status >= 400 && e.status < 500) && count < 2;

export const useMe = () =>
  useQuery<Member>({ queryKey: qk.me, queryFn: () => getApi().me(), retry: noRetryOnClientError, staleTime: 60_000 });

export const useBoard = (slug: string) =>
  useQuery<Board>({ queryKey: qk.board(slug), queryFn: () => getApi().board(slug), retry: noRetryOnClientError });

export const useRequests = (slug: string) =>
  useQuery<Request[]>({ queryKey: qk.requests(slug), queryFn: () => getApi().listRequests(slug), retry: noRetryOnClientError });

export const useInbox = (slug: string) =>
  useQuery<Request[]>({ queryKey: qk.inbox(slug), queryFn: () => getApi().inbox(slug), retry: noRetryOnClientError });

export const useDecisions = (slug: string) =>
  useQuery({ queryKey: qk.decisions(slug), queryFn: () => getApi().listDecisions(slug), retry: noRetryOnClientError });

export const useAgents = (slug: string) =>
  useQuery({ queryKey: qk.agents(slug), queryFn: () => getApi().listMyAgents(slug), retry: noRetryOnClientError });

export const useHandoff = (slug: string, taskId: string) =>
  useQuery({ queryKey: qk.handoff(slug, taskId), queryFn: () => getApi().handoff(slug, taskId), retry: noRetryOnClientError });

function useInvalidate(slug: string) {
  const qc = useQueryClient();
  return (kind: string, id: string | null = null) => applyChange(qc, slug, { kind, id });
}

export function useUpdateStatus(slug: string) {
  const inv = useInvalidate(slug);
  return useMutation({ mutationFn: (i: UpdateStatusInput) => getApi().updateMyStatus(slug, i), onSuccess: () => inv("status") });
}
export function useUpdateMascot(slug: string) {
  const inv = useInvalidate(slug);
  return useMutation({ mutationFn: (i: MascotInput) => getApi().updateMyMascot(slug, i), onSuccess: () => inv("member") });
}
export function useCreateRequest(slug: string) {
  const inv = useInvalidate(slug);
  return useMutation({ mutationFn: (i: CreateRequestInput) => getApi().createRequest(slug, i), onSuccess: (r) => inv("request", r.id) });
}
export function useActOnRequest(slug: string) {
  const inv = useInvalidate(slug);
  return useMutation({
    mutationFn: (v: { id: Id; action: RequestAction; body?: string }) =>
      getApi().actOnRequest(slug, v.id, v.body === undefined ? { action: v.action } : { action: v.action, body: v.body }),
    // invalid_state means someone else moved it first: refresh either way.
    onSettled: (_r, _e, v) => inv("request", v.id),
  });
}
export function useMarkRead(slug: string) {
  const inv = useInvalidate(slug);
  return useMutation({ mutationFn: (id: Id) => getApi().markRead(slug, id), onSuccess: (_r, id) => inv("inbox", id) });
}
export function useRecordDecision(slug: string) {
  const inv = useInvalidate(slug);
  return useMutation({ mutationFn: (i: RecordDecisionInput) => getApi().recordDecision(slug, i), onSuccess: (d) => inv("decision", d.id) });
}
export function useCreateAgent(slug: string) {
  const inv = useInvalidate(slug);
  return useMutation({ mutationFn: (i: CreateAgentInput) => getApi().createAgent(slug, i), onSuccess: () => inv("agent") });
}
export function useRevokeAgent(slug: string) {
  const inv = useInvalidate(slug);
  return useMutation({ mutationFn: (id: Id) => getApi().revokeAgent(slug, id), onSuccess: () => inv("agent") });
}
