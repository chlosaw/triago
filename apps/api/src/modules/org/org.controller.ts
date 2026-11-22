import { DeleteOrgBody, InviteBody, OrgSettingsPatch, UpdateMemberBody } from '@triago/shared';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/auth.js';
import { clearSessionCookie } from '../auth/auth.controller.js';
import * as org from './org.service.js';
import * as team from './team.service.js';

export async function show(req: Request, res: Response) {
  res.json(await org.getOrganisation(getAuth(req).orgId));
}

export async function updateSettings(req: Request, res: Response) {
  const settings = await org.updateSettings(getAuth(req).orgId, OrgSettingsPatch.parse(req.body));
  res.json({ settings });
}

export async function remove(req: Request, res: Response) {
  const { confirmName } = DeleteOrgBody.parse(req.body);
  await org.deleteOrganisation(getAuth(req).orgId, confirmName);
  clearSessionCookie(res);
  res.status(204).end();
}

const Id = z.uuid('Not found.');

export async function invitations(req: Request, res: Response) {
  res.json({ invitations: await team.listInvitations(getAuth(req).orgId) });
}

export async function invite(req: Request, res: Response) {
  res.status(201).json({ invitation: await team.createInvitation(getAuth(req), InviteBody.parse(req.body)) });
}

export async function revokeInvitation(req: Request, res: Response) {
  await team.revokeInvitation(getAuth(req).orgId, Id.parse(req.params.id));
  res.status(204).end();
}

export async function updateMember(req: Request, res: Response) {
  const { role } = UpdateMemberBody.parse(req.body);
  await team.updateMemberRole(getAuth(req).orgId, Id.parse(req.params.userId), role);
  res.status(204).end();
}

/** An admin removing someone, or anyone leaving (their own id). Leaving ends the caller's session. */
export async function removeMember(req: Request, res: Response) {
  const auth = getAuth(req);
  const userId = Id.parse(req.params.userId);
  await team.removeMember(auth, userId);
  if (userId === auth.userId) clearSessionCookie(res);
  res.status(204).end();
}
