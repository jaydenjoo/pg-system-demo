export default function CheckoutIframeLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="w-full max-w-md p-6 animate-pulse space-y-5">
        <div className="h-16 bg-gray-100 rounded-lg" />
        <div className="space-y-3">
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
          <div className="flex gap-3">
            <div className="h-10 bg-gray-100 rounded flex-1" />
            <div className="h-10 bg-gray-100 rounded flex-1" />
            <div className="h-10 bg-gray-100 rounded flex-1" />
          </div>
          <div className="h-12 bg-gray-100 rounded" />
        </div>
      </div>
    </div>
  );
}
