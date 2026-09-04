import { PieceAuth } from '@activepieces/pieces-framework';
import { ninetyCommon } from './common/client';

export const ninetyAuth = PieceAuth.SecretText({
  displayName: 'Personal Access Token',
  description: `Generate a token in Ninety under **Settings > Developer Settings**.

The public API is part of Ninety's Thrive plan, and the token carries its owner's permissions — every step only ever sees the teams and records that user can see.`,
  required: true,
  validate: async ({ auth }) => {
    try {
      await ninetyCommon.validateAuth({ token: auth });
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error:
          'Ninety would not accept this token. Check that it was copied whole from Settings > Developer Settings, and that the account is on the Thrive plan.',
      };
    }
  },
});
