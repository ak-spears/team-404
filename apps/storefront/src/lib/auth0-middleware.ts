import { Auth0Client } from '@auth0/nextjs-auth0/server';

export const auth0 = new Auth0Client({
  beforeSessionSaved: async (session) => {
    console.log('AUTH0 SESSION SAVED:', session?.user?.email);
    return session;
  },
});

