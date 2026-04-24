export default function SkeletonCartPage() {
  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 animate-pulse">
      <div className="h-9 w-48 bg-muted rounded mb-8" />

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4 p-4 border border-border rounded-lg">
              <div className="w-24 h-24 bg-muted rounded-md" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-muted rounded" />
                <div className="h-3 w-1/4 bg-muted rounded" />
                <div className="h-8 w-32 bg-muted rounded mt-2" />
              </div>
              <div className="h-4 w-16 bg-muted rounded" />
            </div>
          ))}
        </div>

        <div className="lg:col-span-1">
          <div className="border border-border rounded-lg p-6">
            <div className="h-6 w-32 bg-muted rounded mb-4" />
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-4 w-16 bg-muted rounded" />
                </div>
              ))}
            </div>
            <div className="h-12 w-full bg-muted rounded mt-6" />
          </div>
        </div>
      </div>
    </div>
  );
}
