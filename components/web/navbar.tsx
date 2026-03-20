import Link from "next/link";

export function Navbar() {
  return (
    <nav className="w-full py-5 flex items-center justify-between">
      <div className="flex items-center gap-8">
        <Link href={"/"}>
          <h1 className="text-3xl font-bold">
            Next<span className="text-blue-500">Pro</span>
          </h1>
        </Link>

        <div className="flex items-center gap-2">
          <Link href={"/"}>Home</Link>
          <Link href={"/blog"}>Blog</Link>
          <Link href={"/create"}>Create</Link>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link href={"/auth/sign-up"}>Sign up</Link>
        <Link href={"/auth/login"}>Login</Link>
      </div>
    </nav>
  );
}
