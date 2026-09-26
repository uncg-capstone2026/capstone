import { Redirect } from 'expo-router';

import { isSignedIn } from '@/services/auth';

export default function Index() {
  return <Redirect href={isSignedIn() ? '/closet' : '/login'} />;
}
