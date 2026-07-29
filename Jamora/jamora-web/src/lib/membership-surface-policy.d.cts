export function membershipSurfaceEnabled(env?: Record<string, string | undefined>): boolean;

export function publicMembershipOffer(env?: Record<string, string | undefined>):
  | { visible: false }
  | {
      visible: true;
      href: string;
      eyebrow: string;
      title: string;
      description: string;
      primaryCta: string;
      secondaryCta: string;
    };

export function visibleAdminNavigation<TGroup>(
  groups: readonly TGroup[],
  role: string,
  membershipEnabled: boolean,
  paymentsEnabled?: boolean,
): TGroup[];

export function membershipCheckoutMode(
  body: { membershipCheckout?: unknown } | null | undefined,
  env?: Record<string, string | undefined>,
): "ordinary" | "membership-disabled" | "membership";
