import React from 'react';

interface HeaderProps {
  onAddChannel: () => void;
}

const Header: React.FC<HeaderProps> = ({ onAddChannel }) => {
  return (
    <header className="bg-white shadow-md">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-800">Channel Tracker</h1>
        <button
          onClick={onAddChannel}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Add Channel
        </button>
      </div>
    </header>
  );
};

export default Header;