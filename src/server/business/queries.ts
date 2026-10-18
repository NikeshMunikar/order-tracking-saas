import "server-only";

import { cache } from "react";

import { getBusinessForUser } from "@/server/business/business-service";

/**
 * Request-scoped memoization of the authorized business read used by the
 * business layout and its pages. React `cache()` dedupes the call within a
 * single render pass, so a layout and a page (or a page and a nested page)
 * that both need the authorized business + acting role issue the
 * authorization checks and reads only once per request — no redundant
 * round trips and no risk of the two views disagreeing.
 */
export const getAuthorizedBusiness = cache(getBusinessForUser);
