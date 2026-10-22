const TestStyles = () => {
  return (
    <div className="p-4 bg-red-500 text-white">
      <h1 className="text-2xl font-bold">Tailwind Test</h1>
      <p className="mt-2 text-sm">If this is styled, Tailwind is working!</p>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="bg-blue-500 p-2 rounded">Blue</div>
        <div className="bg-green-500 p-2 rounded">Green</div>
        <div className="bg-purple-500 p-2 rounded">Purple</div>
      </div>
    </div>
  );
};

export default TestStyles;