import {
  createAction,
  Property,
  isNil,
  spreadIfDefined,
} from '@activepieces/pieces-framework';
import { ninetyAuth } from '../auth';
import { ninetyCommon } from '../common/client';
import { ninetyPropUtils, ninetyProps } from '../common/props';
import { milestoneOutputSchema } from '../common/output-schemas';

export const createMilestone = createAction({
  auth: ninetyAuth,
  name: 'create_milestone',
  classification: 'WRITE',
  displayName: 'Create Milestone',
  description: 'Add a milestone step to an existing rock',
  audience: 'both',
  aiMetadata: {
    description:
      'Creates one milestone under a Ninety rock, the smaller step a quarterly goal is broken into. It needs the parent rock and its team, so create the rock first. Each call creates a new milestone, so retries duplicate.',
    idempotent: false,
  },
  outputSchema: milestoneOutputSchema,
  props: {
    teamId: ninetyProps.teamIdRequired,
    rockId: ninetyProps.rockId,
    title: Property.ShortText({
      displayName: 'Title',
      description: 'The step this milestone represents',
      required: true,
    }),
    dueDate: Property.DateTime({
      displayName: 'Due Date',
      required: true,
    }),
    description: Property.LongText({
      displayName: 'Description',
      required: false,
    }),
    isDone: ninetyProps.completedSetter,
    completedDate: Property.DateTime({
      displayName: 'Completed Date',
      description: 'Ninety requires this whenever the milestone is created as done',
      required: false,
    }),
  },
  async run({ auth, propsValue }) {
    const isDone = ninetyPropUtils.triStateToBoolean(propsValue.isDone);
    const completedDate = ninetyCommon.toOptionalIsoDate({
      value: propsValue.completedDate,
      field: 'Completed Date',
    });

    if (isDone === true && isNil(completedDate)) {
      throw new Error(
        'Ninety needs a Completed Date when a milestone is created as done. Set one, or leave Completed on Leave unchanged.'
      );
    }

    const milestone = await ninetyCommon.createMilestone({
      token: auth.secret_text,
      milestone: {
        rockId: propsValue.rockId,
        teamId: propsValue.teamId,
        title: propsValue.title,
        dueDate: ninetyCommon.toIsoDate({
          value: propsValue.dueDate,
          field: 'Due Date',
        }),
        ...spreadIfDefined('description', propsValue.description),
        ...spreadIfDefined('isDone', isDone),
        ...spreadIfDefined('completedDate', completedDate),
      },
    });
    return milestone;
  },
});
