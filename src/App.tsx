import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useParams, useSearchParams } from 'react-router-dom';
import { Code, Smartphone, Monitor,Tv, Car, Users,Cast, Heart, Lock, Clock, Github } from 'lucide-react';
import ConsoleDisplay from './components/ConsoleDisplay';
import { Card, CardContent } from "./components/card";
import PhoneController from './components/PhoneController';
import LobbyJoin from './components/LobbyJoin';

const platformLogos = [
  {
    name: "Bubble",
  },
  {
    name: "Framer",
  },
  {
    name: "Airtable",
  },
  {
    name: "FlutterFlow",
  },
  {
    name: "Coda",
  },
  {
    name: "Cursor",
  },
  {
    name: "Zapier",
  },
];

const secondRowLogos = [
  {
    name: "Bolt",
  },
  {
    name: "Rentprompts",
  },
  {
    name: "Lovable",
  },
  {
    name: "Co.dev",
  },
  {
    name: "Windsurf",
  },
  {
    name: "Zed",
  },
  {
    name: "Make",
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
      <section className="pt-32 pb-20 w-full text-center px-4 " >
        <h1 className="text-4xl w-full md:text-6xl [font-family:'Slackey',Helvetica] mb-6 bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent ">
          Coding together has never
            <br />
            been so easy
        </h1>
        <p className="text-xl [font-family:'Caveat',Helvetica] font-bold text-indigo-200 mb-8 max-w-2xl mx-auto">
            Use your phone as Controllers and <br />
            start Vibing instantly
        </p>
        <button 
          onClick={() => setIsOnboarding(true)}
          className="hover:bg-indigo-600 text-white px-8 py-3 bg-[#c48c4b] rounded-md transition-colors shadow-[0px_0px_12px_#ffaa3e]"
        >
          Start Coding Now
        </button>
        <p className="text-lg [font-family:'Caveat',Helvetica] font-bold text-gray-500 mt-4 ">
        Start for Free, Get full access later
        </p>
      </section>

      {/* Demo Section */}
      <section className="relative flex justify-center -mt-10-vh overflow-hidden">
        {/* <div className="relative w-4/5 px-36-vh laptop-l:w-3/4">
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
        </div> */}
  <div className="w-full max-w-7xl h-auto mt-4 mx-auto relative px-4 sm:px-6 lg:px-8">
  {/* Main background image */}
  <div className="relative w-full" style={{ aspectRatio: '899/593' }}>
    <img
      className="w-full h-full object-cover rounded-lg"
      alt="Landing widget"
      src="/landing-wiget-1.png"
    />
    
    {/* Overlaid images - positioned responsively */}
    <div className="absolute inset-0">
      {/* First overlay image */}
      <img
        className="absolute w-[40%] sm:w-[40%] h-auto top-[65%] left-[-2%] z-10"
        alt="Image"
        src="/image-11.png"
      />
      
      {/* Second overlay image */}
      <img
        className="absolute w-[23%] sm:w-[23%] h-auto top-[40%] right-[-2%] z-10"
        alt="Image"
        src="/image-12.png"
      />
    </div>
  </div>
</div>
      </section>

      {/* Features */}
      <section id="features" className="pt-20 pb-4 px-4 ">
        <div className="container mx-auto">
          <h2 className="[font-family:'Slackey',Helvetica] font-normal text-white text-2xl sm:text-4xl text-center ">
             Vibe code MultipLayer on any screen
          </h2>
          <p className="text-lg text-center [font-family:'Caveat',Helvetica] font-bold text-gray-500 mb-12">
        Turn any screen into a multiplayer code editor like a console,
            supported on
        </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Monitor, text: "PC (Browser)", desc: "Instant response and feedback" },
              { icon: Car, text: "Cars", desc: "Your vehicle your rules" },
              { icon: Tv, text: "Android TV", desc: "Big Screen experience" },
              { icon: Cast, text: "Fire TV", desc: "No limits, Code anywhere" }
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

       <section className="mt-[20px] overflow-hidden py-8">
          <style jsx>{`
            @keyframes scrollRight {
              0% {
                transform: translateX(0);
              }
              100% {
                transform: translateX(-50%);
              }
            }
            @keyframes scrollLeft {
              0% {
                transform: translateX(-50%);
              }
              100% {
                transform: translateX(0);
              }
            }
            .scroll-fast {
              animation: scrollRight 15s linear infinite;
            }
            .scroll-medium-reverse {
              animation: scrollLeft 25s linear infinite;
            }
          `}</style>
          
          {/* First Row - Fast Speed */}
          <div className="mb-6 overflow-hidden">
            <div className="flex space-x-6 scroll-fast">
              {[...platformLogos, ...platformLogos].map((logo, index) => (
                <Card
                  key={`row1-${index}`}
                  className="flex-shrink-0 w-48 h-20 flex items-center justify-center bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 hover:bg-white/20 transition-all duration-300"
                >
                  <CardContent className="p-0">
                    <div className="[font-family:'Space_Grotesk',Helvetica] font-medium text-white text-lg text-center">
                      {logo.name}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Second Row - Medium Speed, Reverse Direction */}
          <div className="overflow-hidden">
            <div className="flex space-x-6 scroll-medium-reverse">
              {[...secondRowLogos, ...secondRowLogos].map((logo, index) => (
                <Card
                  key={`row2-${index}`}
                  className="flex-shrink-0 w-48 h-20 flex items-center justify-center bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 hover:bg-white/20 transition-all duration-300"
                >
                  <CardContent className="p-0">
                    <div className="[font-family:'Space_Grotesk',Helvetica] font-medium text-white text-lg text-center">
                      {logo.name}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

      <section className="pt-20 pb-4 ">
        <div className="container px-4">
          <h2 className="[font-family:'Slackey',Helvetica] font-normal text-white text-2xl sm:text-4xl text-center ">
   Phone + Screen = Console
          </h2>
          <p className="text-lg text-center [font-family:'Caveat',Helvetica] font-bold text-gray-500 mb-12">
        You already own everything you need. Start instantly
            <br />
            code together on one screen
        </p>
        </div>
        <img
            className="w-full  object-cover"
            alt="Coolicons"
            src="/coolicons-4.png"
          />
      </section>

      <section className="mt-[60px] sm:mt-[80px] lg:mt-[100px] px-4 sm:px-6 lg:px-8">
  <div className="max-w-4xl mx-auto">
    <h2 className="[font-family:'Slackey',Helvetica] font-normal text-white text-2xl sm:text-3xl lg:text-4xl text-center tracking-[0] leading-tight">
      Editor for every taste and every team
    </h2>

    <p className="mt-[10px] [font-family:'Caveat',Helvetica] font-bold text-white text-xl sm:text-2xl lg:text-[32px] text-center tracking-[0] leading-tight">
      You will find over 20+ editors in our library- from Bolt to Cursor and many more yet to come!
    </p>
  </div>
</section>

{/* Stats Section */}
<section className="mt-[60px] sm:mt-[70px] lg:mt-[80px] px-4 sm:px-6 lg:px-8">
  <div className="max-w-7xl mx-auto">
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 sm:gap-6">
      {stats.map((stat, index) => (
        <Card
          key={index}
          className="flex flex-col items-start gap-6 sm:gap-9 p-4 sm:p-6 bg-[#283038] rounded-lg border-none h-auto min-h-[140px] sm:min-h-[174px]"
        >
          <CardContent className="p-0 w-full">
            <div className="flex flex-col items-start relative self-stretch w-full">
              <div className="relative self-stretch [font-family:'Space_Grotesk',Helvetica] font-medium text-white text-sm sm:text-base tracking-[0] leading-6">
                {stat.label}
              </div>
            </div>
            <div className="flex flex-col items-start relative self-stretch w-full mt-4 sm:mt-9">
              <div className="relative self-stretch [font-family:'Space_Grotesk',Helvetica] font-bold text-white text-3xl sm:text-4xl lg:text-[64px] tracking-[0] leading-tight">
                {stat.value}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
</section>

{/* Pro Section */}
<section className="mt-[60px] sm:mt-[70px] lg:mt-[80px] px-4 sm:px-6 lg:px-8">
  {/* Pro Header */}
  <div className="max-w-4xl mx-auto">
    <h2 className="[font-family:'Slackey',Helvetica] font-normal text-white text-2xl sm:text-3xl lg:text-4xl text-center tracking-[0] leading-tight">
      VibeConsole Pro
    </h2>

    <p className="mt-[10px] [font-family:'Caveat',Helvetica] font-bold text-white text-xl sm:text-2xl lg:text-[32px] text-center tracking-[0] leading-tight">
      Unlock the full potential of VibeConsole with Pro. Get unlimited
      collaborators, advanced debugging, priority support, custom
      integrations.
    </p>
  </div>

  {/* Pricing Cards */}
  <div className="max-w-7xl mx-auto mt-[30px] sm:mt-[40px]">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      {pricingPlans.map((plan, index) => (
        <Card
          key={index}
          className="flex flex-col items-start gap-4 p-4 sm:p-6 bg-[#1c2126] rounded-lg border border-solid border-[#3a4754] h-full"
        >
          <CardContent className="p-0 w-full flex flex-col h-full">
            {/* Plan Header */}
            <div className="flex-col items-start gap-1 self-stretch flex relative w-full">
              <div className="flex flex-col items-start relative self-stretch w-full">
                <div className="relative self-stretch [font-family:'Space_Grotesk',Helvetica] font-bold text-white text-base tracking-[0] leading-5">
                  {plan.name}
                </div>
              </div>
              <div className="flex items-baseline gap-1 self-stretch w-full relative">
                <div className="inline-flex flex-col items-start relative">
                  <div className="relative self-stretch [font-family:'Space_Grotesk',Helvetica] font-bold text-white text-2xl sm:text-3xl lg:text-4xl tracking-[-1.00px] leading-tight whitespace-nowrap">
                    {plan.price}
                  </div>
                </div>
                <div className="inline-flex flex-col items-start relative">
                  <div className="relative self-stretch [font-family:'Space_Grotesk',Helvetica] font-bold text-white text-sm sm:text-base tracking-[0] leading-5 whitespace-nowrap">
                    /month
                  </div>
                </div>
              </div>
            </div>

            {/* CTA Button */}
            <button className="w-full h-10 mt-4 items-center justify-center px-4 py-0 bg-[#283038] rounded-lg overflow-hidden flex hover:bg-[#343e48] transition-colors">
              <span className="[font-family:'Space_Grotesk',Helvetica] font-bold text-white text-sm text-center tracking-[0] leading-[21px] whitespace-nowrap">
                {plan.buttonText}
              </span>
            </button>

            {/* Features List */}
            <div className="flex-col items-start gap-2 self-stretch flex relative w-full mt-4 flex-grow">
              {plan.features.map((feature, featureIndex) => (
                <div
                  key={featureIndex}
                  className="flex items-start gap-3 relative self-stretch w-full"
                >
                  <div className="inline-flex flex-col items-start relative flex-shrink-0 mt-1">
                    <div className="relative w-4 h-4 bg-[url(/vector---0.svg)] bg-cover bg-center" />
                  </div>
                  <div className="relative flex-1 [font-family:'Space_Grotesk',Helvetica] font-normal text-white text-[13px] tracking-[0] leading-5">
                    {feature}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
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