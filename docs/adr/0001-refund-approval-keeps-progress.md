# Approving a Refund Request removes access but keeps progress

When an Admin approves a Refund Request on a personal purchase, the learner loses access to the course at that moment, but their lesson progress and watch history are kept, not deleted. If they buy the course again, that progress comes back, and it counts towards Refund Eligibility on the new purchase. Keeping it preserves the evidence behind the decision, and counting it stops a learner cycling buy → watch just under the Watch Limit → refund to see the whole course for free.

## Considered Options

- **Delete progress on approval**: simplest, but irreversible and it destroys the evidence for the decision (and for any chargeback dispute).
- **Keep progress as a record only, and start a new purchase from zero**: rejected because progress is stored per learner and lesson, not per purchase. Separating "old" from "new" progress would mean scoping every progress read, and Refund Eligibility, to a purchase.
- **Keep and restore** (chosen).

## Consequences

- Access is ended by marking the learner's enrollment as no longer granting access, not by deleting the enrollment row, so a later purchase can restore it with its original history.
- A learner who comes back may be over the Watch Limit or Completion Limit straight away, and so unable to refund the second purchase. This is intended.
