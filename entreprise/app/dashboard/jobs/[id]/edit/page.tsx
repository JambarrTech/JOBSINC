'use client';

import { useParams } from 'next/navigation';
import NewJobForm from '@/components/dashboard/NewJobForm';

export default function EditJobPage() { const { id } = useParams<{ id: string }>(); return <NewJobForm jobId={id} />; }
