"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Board, DecisionProposal, Id, Me, Request } from "@officehub/shared";
import {
  getApi,
  isApiError,
  type ActInput,
  type ChangeEvent,
  type ChangeKind,
  type CreateAgentInput,
  type CreateRequestInput,
  type MascotInput,
  type ProposalActionInput,
  type Queue,
  type RecordDecisionInput,
  type RoleStatusInput,
  type UpdateRoleInput,
} from "./api";

export const qk = {
  me: ["me"] as const,
  board: (slug: string) => ["board", slug] as const,
  queue: (slug: string) => ["queue", slug] as const,
  requests: (slug: string) => ["requests", slug] as const,
  request: (slug: string, id: string) => ["request", slug, id] as const,
  decisions: (slug: string) => ["decisions", slug] as const,
  proposals: (slug: string) => ["proposals", slug] as const,
  agents: (slug: string) => ["agents", slug] as const,
  handoff: (slug: string, id: string) => ["handoff", slug, id] as const,
};

/**
 * Which queries a server "change" event (kind = shared ChangeKind) makes stale.
 * card/event/role -> board; request -> board, queue, requests, request detail; decision -> decisions, board;
 * proposal -> queue, proposals, board; agent -> agents; member -> board, me; task -> board, handoff.
 * "all" (unparseable message) refreshes everything.
 */
export function keysForChange(slug: string, e: ChangeEvent): (readonly unknown[])[] {
  const board = qk.board(slug);
  switch (e.kind) {
    case "card":
    case "event":
    case "role":
      return [board];
    case "request":
      return [board, qk.queue(slug), qk.requests(slug), e.id ? qk.request(slug, e.id) : ["request", slug]];
    case "decision":
      return [qk.decisions(slug), board];
    case "proposal":
      return [qk.queue(slug), qk.proposals(slug), board];
    case "agent":
      return [qk.agents(slug)];
    case "member":
      return [board, qk.me];
    case "task":
      return [board, ["handoff", slug]];
    default:
      return [qk.me, board, qk.queue(slug), qk.requests(slug), ["request", slug], qk.decisions(slug), qk.proposals(slug), qk.agents(slug), ["handoff", slug]];
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
  useQuery<Me>({ queryKey: qk.me, queryFn: () => getApi().me(), retry: noRetryOnClientError, staleTime: 60_000 });

export const useBoard = (slug: string) =>
  useQuery<Board>({ queryKey: qk.board(slug), queryFn: () => getApi().board(slug), retry: noRetryOnClientError });

export const useQueue = (slug: string) =>
  useQuery<Queue>({ queryKey: qk.queue(slug), queryFn: () => getApi().queue(slug), retry: noRetryOnClientError });

export const useRequests = (slug: string) =>
  useQuery<Request[]>({ queryKey: qk.requests(slug), queryFn: () => getApi().listRequests(slug), retry: noRetryOnClientError });

export const useRequest = (slug: string, id: string) =>
  useQuery<Request>({ queryKey: qk.request(slug, id), queryFn: () => getApi().getRequest(slug, id), retry: noRetryOnClientError });

export const useDecisions = (slug: string) =>
  useQuery({ queryKey: qk.decisions(slug), queryFn: () => getApi().listDecisions(slug), retry: noRetryOnClientError });

export const useProposals = (slug: string) =>
  useQuery<DecisionProposal[]>({ queryKey: qk.proposals(slug), queryFn: () => getApi().listProposals(slug), retry: noRetryOnClientError });

export const useAgents = (slug: string) =>
  useQuery({ queryKey: qk.agents(slug), queryFn: () => getApi().listMyAgents(slug), retry: noRetryOnClientError });

export const useHandoff = (slug: string, taskId: string) =>
  useQuery({ queryKey: qk.handoff(slug, taskId), queryFn: () => getApi().handoff(slug, taskId), retry: noRetryOnClientError });

function useInvalidate(slug: string) {
  const qc = useQueryClient();
  return (kind: ChangeKind, id: string | null = null) => applyChange(qc, slug, { kind, id });
}

export function useUpdateMascot(slug: string) {
  const inv = useInvalidate(slug);
  return useMutation({ mutationFn: (i: MascotInput) => getApi().updateMyMascot(slug, i), onSuccess: () => inv("member") });
}
export function useUpdateRole(slug: string) {
  const inv = useInvalidate(slug);
  return useMutation({ mutationFn: (v: { id: Id; input: UpdateRoleInput }) => getApi().updateRole(slug, v.id, v.input), onSuccess: (r) => inv("role", r.id) });
}
export function useUpdateRoleStatus(slug: string) {
  const inv = useInvalidate(slug);
  return useMutation({ mutationFn: (v: { id: Id; input: RoleStatusInput }) => getApi().updateRoleStatus(slug, v.id, v.input), onSuccess: (_r, v) => inv("card", v.id) });
}
export function useCreateRequest(slug: string) {
  const inv = useInvalidate(slug);
  return useMutation({ mutationFn: (i: CreateRequestInput) => getApi().createRequest(slug, i), onSuccess: (r) => inv("request", r.id) });
}
export function useActOnRequest(slug: string) {
  const inv = useInvalidate(slug);
  return useMutation({
    mutationFn: (v: { id: Id } & ActInput) => {
      const input: ActInput = { action: v.action };
      if (v.body !== undefined) input.body = v.body;
      if (v.autoForwardReply) input.autoForwardReply = true;
      return getApi().actOnRequest(slug, v.id, input);
    },
    // invalid_state means it moved first (e.g. an agent acted): refresh either way.
    onSettled: (_r, _e, v) => inv("request", v.id),
  });
}
export function useMarkRead(slug: string) {
  const inv = useInvalidate(slug);
  return useMutation({ mutationFn: (id: Id) => getApi().markRead(slug, id), onSuccess: (_r, id) => inv("request", id) });
}
export function useRecordDecision(slug: string) {
  const inv = useInvalidate(slug);
  return useMutation({ mutationFn: (i: RecordDecisionInput) => getApi().recordDecision(slug, i), onSuccess: (d) => inv("decision", d.id) });
}
export function useActOnProposal(slug: string) {
  const inv = useInvalidate(slug);
  return useMutation({
    mutationFn: (v: { id: Id; input: ProposalActionInput }) => getApi().actOnProposal(slug, v.id, v.input),
    onSettled: (r, _e, v) => {
      inv("proposal", v.id);
      if (r?.decision) inv("decision", r.decision.id);
    },
  });
}
export function useCreateAgent(slug: string) {
  const inv = useInvalidate(slug);
  return useMutation({ mutationFn: (i: CreateAgentInput) => getApi().createAgent(slug, i), onSuccess: () => inv("agent") });
}
export function useRevokeAgent(slug: string) {
  const inv = useInvalidate(slug);
  return useMutation({ mutationFn: (id: Id) => getApi().revokeAgent(slug, id), onSuccess: () => inv("agent") });
}
