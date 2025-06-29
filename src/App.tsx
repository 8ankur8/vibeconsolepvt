import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useParams, useSearchParams } from 'react-router-dom';
import { Code, Smartphone, Monitor, Music2, Users, Heart, Lock, Clock, Github } from 'lucide-react';
import ConsoleDisplay from './components/ConsoleDisplay';
import PhoneController from './components/PhoneController';
import LobbyJoin from './components/LobbyJoin';

const platformLogos = [
  {
    name: "Bubble",
    src: "/bubble-logo.png",
    width: "w-[212.36px]",
    height: "h-[48.13px]",
  },
  {
    name: "Framer",
    src: "/framer-logo.png",
    width: "w-[147.73px]",
    height: "h-[48.09px]",
  },
  {
    name: "Airtable",
    src: "/aitable-logo.png",
    width: "w-[220.36px]",
    height: "h-[48.14px]",
  },
  {
    name: "FlutterFlow",
    src: "/flutterflow-logo.png",
    width: "w-[266.19px]",
    height: "h-[48.17px]",
  },
  {
    name: "Coda",
    src: "/coda-logo.png",
    width: "w-[139.01px]",
    height: "h-12",
  },
];

const secondRowLogos = [
  {
    name: "Bolt",
    src: "/bolt-logo.png",
    width: "w-[111.78px]",
    height: "h-12",
  },
  {
    name: "Webflow",
    src: "/webflow-logo.png",
    width: "w-[287.96px]",
    height: "h-12",
  },
  {
    name: "Lovable",
    src: "/lovable-logo.png",
    width: "w-60",
    height: "h-12",
    objectCover: true,
  },
  {
    name: "Glide",
    src: "/glide-logo.png",
    width: "w-[155.09px]",
    height: "h-12",
  },
];

const thirdRowLogos = [
  {
    name: "Cursor",
    src: "/cursor-logo.png",
    width: "w-[202.72px]",
    height: "h-12",
  },
  {
    name: "Zapier",
    src: "/zapier-logo.png",
    width: "w-[177.13px]",
    height: "h-12",
  },
  {
    name: "Windsurf",
    isComponent: true,
    width: "w-[221.49px]",
    height: "h-12",
  },
  {
    name: "Softr",
    src: "/softr-logo.png",
    width: "w-[172.55px]",
    height: "h-12",
  },
  {
    name: "Make",
    isComponent: true,
    width: "w-[232.61px]",
    height: "h-12",
  },
];

const navItems = [
  { name: "Build", active: true },
  { name: "FAQ", active: false },
  { name: "Community", active: false },
  { name: "About", active: false },
];

const pricingPlans = [
  {
    name: "Free",
    price: "$0",
    buttonText: "Get Started",
    features: ["Limited lobbies", "Upto 4 members", "Community support"],
  },
  {
    name: "Pro",
    price: "$15",
    buttonText: "Upgrade",
    features: [
      "Unlimited lobbies",
      "Upto 6 members",
      "Priority support",
    ],
  },
];

const stats = [
  { label: "Active Users", value: "100K+" },
  { label: "Projects Created", value: "50K+" },
];



function App() {
  const [isOnboarding, setIsOnboarding] = useState(false);

  const LandingPage = () => (
    <div className="min-h-screen bg-[#1f252a] backdrop-blur-md border-b border-white/10 flex flex-col justify-center w-full text-white">
      {/* Navigation */}
      <nav className="w-full z-50 backdrop-blur-md ">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Code size={28} className="text-indigo-300" />
            <span className="text-xl font-bold bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">
              VibeConsole
            </span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="text-indigo-200 hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="text-indigo-200 hover:text-white transition-colors">Pricing</a>
            <a href="#faq" className="text-indigo-200 hover:text-white transition-colors">FAQ</a>
          </div>
        </div>
        <div class="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 text-center px-4">
        <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent max-width-9/10">
          Real-time multiplayer gaming made simple
        </h1>
        <p className="text-lg text-indigo-200 mb-8 max-w-2xl mx-auto">
          Use your phone as a controller to play interactive games on any screen.
          Create lobbies, connect instantly, and play together in real-time.
        </p>
        <button 
          onClick={() => setIsOnboarding(true)}
          className="bg-indigo-500 hover:bg-indigo-600 text-white px-8 py-3 rounded-full font-medium transition-colors"
        >
          Start Playing Free
        </button>
        <p className="text-sm text-indigo-300 mt-4">
          Join thousands of players worldwide
        </p>
      </section>

      {/* Demo Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto flex flex-col items-center">
          <div className="relative w-full max-w-4xl aspect-video rounded-lg overflow-hidden border border-indigo-500/20 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/60 to-blue-900/60">
              <div className="h-full flex items-center justify-center">
                <Visualizer />
              </div>
            </div>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-4 max-w-xs">
            {[1, 2].map((i) => (
              <div key={i} className="bg-black/30 p-4 rounded-lg border border-indigo-500/20">
                <div className="h-32 flex items-center justify-center">
                  <Smartphone className="text-indigo-300" size={48} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 bg-black/20">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Play on any device, anywhere
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Monitor, text: "Console Display", desc: "Big screen gaming experience" },
              { icon: Smartphone, text: "Phone Controller", desc: "Your phone becomes the gamepad" },
              { icon: Music2, text: "Real-time Sync", desc: "Instant response and feedback" },
              { icon: Users, text: "Multiplayer", desc: "Up to 8 players per lobby" }
            ].map((item, i) => (
              <div key={i} className="bg-indigo-900/30 p-6 rounded-lg border border-indigo-500/20">
                <item.icon size={32} className="text-indigo-300 mb-4" />
                <h3 className="text-xl font-semibold mb-2">{item.text}</h3>
                <p className="text-indigo-200">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl font-bold text-center mb-12">Simple Pricing</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-indigo-900/30 p-8 rounded-lg border border-indigo-500/20">
              <h3 className="text-xl font-semibold mb-4">Free</h3>
              <div className="text-4xl font-bold mb-6">$0</div>
              <ul className="space-y-4">
                <li className="flex items-center">
                  <Lock size={20} className="text-indigo-300 mr-2" />
                  Limited lobbies
                </li>
                <li className="flex items-center">
                  <Users size={20} className="text-indigo-300 mr-2" />
                  Up to 4 players
                </li>
                <li className="flex items-center">
                  <Clock size={20} className="text-indigo-300 mr-2" />
                  30-minute sessions
                </li>
              </ul>
            </div>
            <div className="bg-indigo-600/20 p-8 rounded-lg border border-indigo-400/30 relative">
              <div className="absolute -top-3 right-4 bg-indigo-500 px-3 py-1 rounded-full text-sm">
                Popular
              </div>
              <h3 className="text-xl font-semibold mb-4">Pro</h3>
              <div className="text-4xl font-bold mb-6">$9.99</div>
              <ul className="space-y-4">
                <li className="flex items-center">
                  <Lock size={20} className="text-indigo-300 mr-2" />
                  Unlimited lobbies
                </li>
                <li className="flex items-center">
                  <Users size={20} className="text-indigo-300 mr-2" />
                  Up to 8 players
                </li>
                <li className="flex items-center">
                  <Heart size={20} className="text-indigo-300 mr-2" />
                  Priority support
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black/40 border-t border-white/10 py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-2 mb-4 md:mb-0">
              <Code size={24} className="text-indigo-300" />
              <span className="text-xl font-bold">VibeConsole</span>
            </div>
            <div className="flex items-center gap-6">
              <a href="https://github.com" target="_blank" rel="noopener noreferrer">
                <Github className="text-indigo-300 hover:text-white transition-colors" size={24} />
              </a>
            </div>
          </div>
          <div className="mt-8 text-center text-indigo-300/70 text-sm">
            <p>© {new Date().getFullYear()} VibeConsole. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );

  const ControllerWrapper = () => {
    const [searchParams] = useSearchParams();
    const lobbyCode = searchParams.get('lobby');
    
    if (lobbyCode) {
      return <PhoneController lobbyCode={lobbyCode} />;
    }
    
    return <LobbyJoin />;
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={isOnboarding ? <ConsoleDisplay /> : <LandingPage />} />
        <Route path="/controller" element={<ControllerWrapper />} />
      </Routes>
    </BrowserRouter>
  );
}

const Visualizer: React.FC = () => {
  return (
    <div className="w-3/4 h-32 relative flex items-end justify-around">
      {[...Array(30)].map((_, i) => (
        <div
          key={i}
          className="w-2 bg-indigo-500/80 mx-px rounded-t animate-pulse"
          style={{
            height: `${Math.random() * 100}%`,
            animationDuration: `${0.8 + Math.random() * 1}s`,
          }}
        />
      ))}
    </div>
  );
};

export default App;