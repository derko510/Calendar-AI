// RSVP helpers: reading and changing the signed-in guest's answer to an invitation.
// Pure functions (no React, no imports) so they can be checked with plain node.

export const RSVP_STATUSES = ['accepted', 'tentative', 'declined'];

const SUFFIX = { declined: ' (declined)', tentative: ' (maybe)', needsAction: ' (not answered)' };

// The attendee entry for the signed-in user, or null
export const getSelfAttendee = (event) =>
  (event?.attendees || []).find(a => a?.self === true) || null;

// 'accepted' | 'tentative' | 'declined' | 'needsAction', or null when the user is not a guest
export const getMyResponse = (event) => getSelfAttendee(event)?.responseStatus ?? null;

// Only invitations the user can answer: they are a guest, did not organise it, and it is not cancelled
export const canRsvp = (event) =>
  !!getSelfAttendee(event) && !event?.organizer?.self && event?.status !== 'cancelled';

// A new attendees array with only the signed-in guest's answer changed. The input is not mutated.
export const withMyResponse = (event, status) => {
  const self = getSelfAttendee(event);
  if (!self) throw new Error('You are not a guest of this event.');
  if (!RSVP_STATUSES.includes(status)) throw new Error(`Unknown response: ${status}`);
  return event.attendees.map(a => (a.self === true ? { ...a, responseStatus: status } : { ...a }));
};

// How an event should look in the calendar grid, from the user's answer
export const rsvpMarks = (event) => {
  const status = getMyResponse(event);
  return {
    declined: status === 'declined',
    dashed: status === 'needsAction' || status === 'tentative',
    suffix: SUFFIX[status] || ''
  };
};
