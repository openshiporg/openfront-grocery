import { redirect } from 'next/navigation';

export default function SignUpClosed() {
  redirect('/dashboard/signin');
}