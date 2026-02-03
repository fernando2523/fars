import Head from 'next/head'

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <>
            <Head>
                <title>CE Print</title>
                <meta name="description" content="Print" />
            </Head>

            <div>{children}</div>
        </>
    )
}