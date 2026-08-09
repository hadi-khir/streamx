import type { SessionUser, SessionInfo } from '$lib/server/auth';

declare global {
	namespace App {
		interface Locals {
			user: SessionUser | null;
			session: SessionInfo | null;
		}
	}
}

export {};
