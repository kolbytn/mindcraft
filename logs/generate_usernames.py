# -*- coding: utf-8 -*-
# ^^^ Add encoding declaration for potentially wider character sets in lists
# --- Imports ---
import random
import os
import sys # Import sys to access command-line arguments
import itertools # Import itertools for generating combinations


# Increase recursion depth if needed for large set operations (unlikely but possible)
# sys.setrecursionlimit(2000)

# --- Massively Expanded Word Lists (Targeting 750+ unique per category) ---

# NOTE: Generating truly meaningful and diverse lists of this size requires
# significant effort or large external datasets. These lists are expanded
# considerably using thematic variations, synonyms, and related concepts.
# They aim for the quantity requested, combining common and more specific terms.

PROFESSIONS = list(set([
    # Core & Fantasy
    "Wizard", "Maven", "Guru", "Master", "Apprentice", "Hunter", "Gatherer",
    "Coder", "Artist", "Chef", "Pilot", "Doctor", "Teacher", "Scientist",
    "Musician", "Gamer", "Writer", "Explorer", "Builder", "Creator",
    "Analyst", "Architect", "Strategist", "Voyager", "Dreamer", "Engineer",
    "Designer", "Bard", "Rogue", "Paladin", "Alchemist", "Druid", "Ranger",
    "Sentinel", "Guardian", "Navigator", "Captain", "Commander", "Sergeant",
    "Healer", "Oracle", "Sage", "Scholar", "Scribe", "Merchant", "Trader",
    "Blacksmith", "Jeweler", "Cartographer", "Monk", "Necromancer", "Summoner",
    "Technomancer", "Hacker", "Broker", "Agent", "Scout", "Spy", "Jester",
    "Minstrel", "Curator", "Warden", "Keeper", "Chronicler", "Inventor",
    "Mechanist", "Artificer", "Gladiator", "Nomad", "Hermit", "Shaman",
    "Geologist", "Biologist", "Physicist", "Astronomer", "Linguist", "Historian",
    "Philosopher", "Enforcer", "Detective", "Journalist", "Photographer", "Sculptor",
    # Expansion
    "Mage", "Sorcerer", "Warlock", "Cleric", "Priest", "Templar", "Crusader",
    "Berserker", "Barbarian", "Warrior", "Knight", "Duelist", "Swashbuckler",
    "Assassin", "Thief", "Ninja", "Samurai", "Ronin", "Geomancer", "Pyromancer",
    "Cryomancer", "Aeromancer", "Hydromancer", "Chronomancer", "Illusionist",
    "Enchanter", "Runesmith", "Wordsmith", "Beastmaster", "Tamer", "Falconer",
    "Herbalist", "Apothecary", "Poisoner", "Tinkerer", "Demolitionist",
    "Pathfinder", "Trailblazer", "Surveyor", "Prospector", "Miner", "Lumberjack",
    "Farmer", "Fisherman", "Shepherd", "Vintner", "Brewer", "Baker", "Butcher",
    "Candlemaker", "Cobbler", "Cooper", "Fletcher", "Innkeeper", "Mason",
    "Potter", "Sailor", "Shipwright", "Tailor", "Tanner", "Weaver", "Woodcarver",
    "Governor", "Chancellor", "Diplomat", "Ambassador", "Councilor", "Judge",
    "Librarian", "Archivist", "Mathematician", "Astronomer", "Botanist", "Zoologist",
    "Archeologist", "Anthropologist", "Sociologist", "Psychologist", "Mentor",
    "Tutor", "Instructor", "Professor", "Dean", "Headmaster", "Principal",
    "Acolyte", "Initiate", "Neophyte", "Disciple", "Follower", "Zealot", "Cultist",
    "Prophet", "Seer", "Diviner", "Mystic", "Visionary", "Ascetic", "Pilgrim",
    "Mercenary", "BountyHunter", "Privateer", "Corsair", "Smuggler", "Outlaw",
    "Bandit", "Rebel", "Revolutionary", "FreedomFighter", "Gladiator",
    "Charioteer", "Pitfighter", "Champion", "Hero", "Villain", "Antihero",
    "Adventurer", "Soldier", "Officer", "General", "Admiral", "Marshal",
    "Tactician", "Quartermaster", "Medic", "CombatMedic", "FieldAgent",
    "Operative", "DoubleAgent", "Infiltrator", "Saboteur", "Courier", "Messenger",
    "Herald", "TownCrier", "Guide", "Interpreter", "Translator", "Negotiator",
    "Arbitrator", "Mediator", "Executioner", "Jailer", "Constable", "Sheriff",
    "Bailiff", "Investigator", "Foreman", "Supervisor", "Manager", "Director",
    "Executive", "Administrator", "Secretary", "Clerk", "Accountant", "Auditor",
    "Actuary", "Banker", "Financier", "Investor", "Speculator", "Entrepreneur",
    "Artisan", "Craftsman", "Technician", "Mechanic", "Operator", "Programmer",
    "Developer", "SysAdmin", "NetAdmin", "DBAdmin", "Webmaster", "ContentCreator",
    "Influencer", "Blogger", "Vlogger", "Podcaster", "Streamer", "Moderator",
    "Animator", "Illustrator", "Painter", "Engraver", "Printer", "Composer",
    "Arranger", "Conductor", "Performer", "Actor", "Dancer", "Choreographer",
    "Orator", "Storyteller", "Poet", "Playwright", "Novelist", "Editor",
    "Publisher", "Critic", "Reviewer", "Commentator", "Pundit", "Host",
    "Announcer", "Reporter", "Anchor", "Correspondent", "Cameraman", "Director",
    "Producer", "SoundEngineer", "LightingTech", "SetDesigner", "Costumer",
    "MakeupArtist", "Stylist", "Barber", "Beautician", "Therapist", "Counselor",
    "Coach", "Trainer", "Dietitian", "Nurse", "Surgeon", "Dentist", "Optometrist",
    "Pharmacist", "Paramedic", "Veterinarian", "Caretaker", "Nanny", "Butler",
    "Maid", "Valet", "Chauffeur", "Bodyguard", "Bouncer", "Doorman", "Concierge",
    "Bellhop", "Waiter", "Bartender", "Sommelier", "Barista", "FlightAttendant",
    "Librarian", "MuseumGuide", "ParkRanger", "Lifeguard", "Firefighter",
    "PoliceOfficer", "Detective", "Profiler", "IntelligenceAgent", "Analyst",
    "Cryptographer", "Codebreaker", "Linguist", "Archivist", "Researcher",
    "LabTechnician", "FieldResearcher", "Experimentalist", "Theorist", "Statistician",
    "DataScientist", "MachineLearningEngineer", "AI_Specialist", "Roboticist",
    "NetworkEngineer", "SecurityAnalyst", "PenTester", "EthicalHacker",
    "ForensicAnalyst", "GameDeveloper", "LevelDesigner", "NarrativeDesigner",
    "SoundDesigner", "Tester", "QA_Engineer", "CommunityManager", "SupportAgent",
    "Salesperson", "Marketer", "Advertiser", "PR_Specialist", "Recruiter",
    "HR_Manager", "Lawyer", "Paralegal", "Judge", "Politician", "Activist",
    "Lobbyist", "UnionRep", "Volunteer", "Philanthropist", "SocialWorker",
    "Consultant", "Freelancer", "Contractor", "GigWorker", "SoleProprietor",
    "Journeyman", "Expert", "Virtuoso", "Prodigy", "Maestro", "Specialist",
    "Generalist", "Pioneer", "Innovator", "Futurist", "Visionary", "Leader",
    "Follower", "Helper", "Assistant", "Associate", "Partner", "Collaborator",
    "Competitor", "Rival", "Mentor", "Protege", "Patron", "Client", "Customer",
    "Patient", "Student", "Citizen", "Resident", "Immigrant", "Expatriate",
    "Refugee", "Tourist", "Traveler", "Wanderer", "Drifter", "Outcast", "Exile",
    "Survivor", "Witness", "Observer", "Participant", "Subject", "Candidate",
    "Contender", "Challenger", "Victor", "Loser", "Slave", "Servant", "Peasant",
    "Serf", "Commoner", "Nobleman", "Aristocrat", "Royalty", "Emperor", "King",
    "Queen", "Prince", "Princess", "Duke", "Duchess", "Marquis", "Count",
    "Viscount", "Baron", "Lord", "Lady", "Sir", "Dame", "Esquire", "Gentleman",
    # Add more niche/specific/combined roles if needed to reach 750
    "SkyCaptain", "DeepMiner", "GeneSplicer", "MemeLord", "DataWrangler",
    "SynthWeaver", "BioHacker", "RealityBender", "VoidWalker", "StarSeer",
    "TimeWarden", "SoulBinder", "ShadowDancer", "LightBringer", "StormCaller",
    "EarthShaker", "FlameWielder", "IceShaper", "PlantWhisperer", "MetalShaper",
    "BloodMage", "SpiritTalker", "DreamWalker", "NightmareWeaver", "ChaosAgent",
    "OrderKeeper", "TruthSeeker", "LieSmith", "FateSpinner", "DoomBringer",
    "HopeBearer", "MemoryKeeper", "LoreMaster", "MythMaker", "LegendSeeker",
    "ClockMaker", "MapMaker", "ToyMaker", "Perfumer", "GloveMaker", "HatMaker",
    "LockSmith", "GemCutter", "GlassBlower", "StoneMason", "RoadBuilder",
    "BridgeBuilder", "CanalDigger", "WellDigger", "ChimneySweep", "RatCatcher",
    "GongFarmer", "Mudlark", "Scavenger", "Recycler", "JunkDealer", "PawnBroker",
    "MoneyLender", "BookBinder", "Illuminator", "Calligrapher", "Courtier",
    "Emissary", "Legate", "Envoy", "Plenipotentiary", "Spymaster", "AssassinGuildLeader",
    "ThiefGuildMaster", "MercenaryCaptain", "PirateKing", "Warlord", "Chieftain",
    "TribalElder", "MedicineMan", "WitchDoctor", "HighPriest", "Abbot", "Bishop",
    "Cardinal", "Pope", "Imam", "Rabbi", "Guru", "Sensei", "Roshi", "Lama",
    "DruidArchon", "RangerLord", "PaladinOrderMaster", "Archmage", "MasterAssassin",
    "Grandmaster", "CelestialPilot", "QuantumPhysicist", "NeuroScientist",
    "AstroBiologist", "CryptoZoologist", "ParaPsychologist", "Ufologist",
    "ConspiracyTheorist", "MythBuster", "FactChecker", "Debunker", "Propagandist",
    "SpinDoctor", "Satirist", "Parodist", "Impersonator", "Mimic", "Ventriloquist",
    "Puppeteer", "CircusMaster", "RingLeader", "Acrobat", "Contortionist",
    "Strongman", "KnifeThrower", "FireEater", "SwordSwallower", "Magician",
    "EscapeArtist", "Mentalist", "Hypnotist", "AnimalTrainer", "Clown", "Harlequin",
    "Pierrot", "Pantomime", "CharacterActor", "Stuntman", "VoiceActor", "Narrator",
    "Auctioneer", "Realtor", "Surveyor", "Appraiser", "InsuranceAgent",
    "Underwriter", "ClaimsAdjuster", "LossPreventer", "SecurityGuard",
    "AirTrafficController", "TrainConductor", "BusDriver", "TaxiDriver",
    "Trucker", "DeliveryDriver", "Dispatcher", "Logistician", "SupplyChainManager",
    "WarehouseWorker", "ForkliftOperator", "CraneOperator", "HeavyEquipmentOp",
    "Welder", "Pipefitter", "Electrician", "Plumber", "HVACTech", "Carpenter",
    "Roofer", "Painter", "Drywaller", "Floorer", "TileSetter", "Landscaper",
    "Arborist", "Groundskeeper", "PoolCleaner", "Exterminator", "Janitor",
    "Custodian", "SanitationWorker", "RecyclingOperator", "DemolitionWorker",
    "HazardousMaterialsTech", "SafetyInspector", "BuildingInspector", "FoodInspector",
    "HealthInspector", "CustomsOfficer", "ImmigrationOfficer", "BorderPatrolAgent",
    "ParkRanger", "FishAndGameWarden", "Forester", "Conservationist",
    "Ecologist", "Oceanographer", "Meteorologist", "Climatologist", "Volcanologist",
    "Seismologist", "Paleontologist", "Mineralogist", "Petrologist", "Hydrologist",
    "Glaciologist", "SoilScientist", "Agronomist", "Horticulturist", "Florist",
    "Ichthyologist", "Herpetologist", "Ornithologist", "Entomologist", "Mammalogist",
    "Primatologist", "Microbiologist", "Virologist", "Bacteriologist", "Mycologist",
    "Parasitologist", "Immunologist", "Geneticist", "Epidemiologist", "Toxicologist",
    "Pharmacologist", "Pathologist", "Radiologist", "Anesthesiologist", "Cardiologist",
    "Dermatologist", "Endocrinologist", "Gastroenterologist", "Hematologist",
    "Nephrologist", "Neurologist", "Oncologist", "Ophthalmologist", "Orthopedist",
    "Otolaryngologist", "Pediatrician", "Psychiatrist", "Pulmonologist", "Rheumatologist",
    "Urologist", "Podiatrist", "Chiropractor", "Acupuncturist", "MassageTherapist",
    "PhysicalTherapist", "OccupationalTherapist", "SpeechTherapist", "Audiologist",
    "Midwife", "Doula", "Mortician", "Embalmer", "Coroner", "MedicalExaminer",
    "ForensicScientist", "BallisticsExpert", "FingerprintAnalyst", "DNAAnalyst",
    "DocumentExaminer", "ArsonInvestigator", "AccidentReconstructionist",
    "PolygraphExaminer", "K9Officer", "MountedPolice", "SWATOfficer", "HostageNegotiator",
    "BombTechnician", "AirMarshal", "SecretServiceAgent", "FBI_Agent", "CIA_Agent",
    "NSA_Analyst", "DEA_Agent", "ATF_Agent", "US_Marshal", "DiplomaticSecurity",
    "MilitaryPolice", "CoastGuard", "Infantryman", "Artilleryman", "CavalryScout",
    "TankCommander", "CombatEngineer", "Pilot", "Navigator", "DroneOperator",
    "Submariner", "SEAL", "GreenBeret", "Ranger", "DeltaForce", "Pararescueman",
    "IntelligenceOfficer", "LogisticsOfficer", "PersonnelOfficer", "PublicAffairs",
    "Chaplain", "MilitaryLawyer", "MilitaryDoctor", "FlightSurgeon", "CyberWarfare",
    "SpaceForceGuardian", "TestPilot", "Astronaut", "MissionControl", "RocketScientist",
    "SatelliteTech", "SpaceSystemsOp", "PlanetaryScientist", "ExoBiologist",
    "Terraformer", "AstroMiner", "StellarCartographer", "WarpFieldSpecialist",
    "Cyberneticist", "AndroidTechnician", "AI_Psychologist", "SynthProgrammer",
    "HoloDesigner", "VR_Architect", "NeuralInterfaceTech", "BioEnhancementSpec",
    "CloningTechnician", "CryonicsSpecialist", "Nanotechnologist", "QuantumMechanic",
    "ZeroG_Welder", "AsteroidMiner", "LunarGeologist", "MartianBotanist",
    "TitanFisherman", "EuropaExplorer", "GasGiantProspector", "VoidSurveyor",
    "AlienLinguist", "XenoAnthropologist", "FirstContactSpec", "GalacticDiplomat",
    "StarshipCaptain", "FleetAdmiral", "SectorCommander", "PlanetaryGovernor",
    "ImperialGuard", "RebelLeader", "SmugglerCaptain", "BountyGuildMaster",
    "InfoBroker", "CyberRunner", "StreetSamurai", "Rigger", "Decker", "Technoshaman",
    "DataThief", "CorpSecOfficer", "Fixer", "Ripperdoc", "Joytech", "SimstimArtist",
    "MediaProducer", "Netcaster", "TruthSayer", "ProphetOfWoe", "CultLeader",
    "DoomsdayPrepper", "Survivalist", "Homesteader", "Recluse", "Misanthrope",
    "Philanthropist", "Humanitarian", "Activist", "Advocate", "Organizer",
    "Educator", "Motivator", "Inspirer", "RoleModel", "Iconoclast", "Maverick",
    "Renegade", "Pioneer", "Trailblazer", "StandardBearer", "Vanguard", "Luminary", "Andy-4-"
]))

ADJECTIVES = list(set([
    # Core
    "Code", "Music", "Official", "Streamer", "Tech", "Starry", "Simple",
    "Big", "Gaming", "Workout", "DIY", "Mindful", "Foodie", "Travel",
    "Pixel", "Byte", "Data", "Synth", "Digital", "Analog", "Creative",
    "Brave", "Happy", "Strong", "Quiet", "Agile", "Electric", "Mystic",
    "Fierce", "Clever", "Speedy", "Golden", "Silver", "Cosmic", "Infinite",
    "Quantum", "Stealthy", "Radiant", "Crimson", "Azure", "Mysterious",
    "Vivid", "Silent", "Roaring", "Frozen", "Burning", "Virtual", "Cyber",
    "Galactic", "Stellar", "Solar", "Lunar", "Arcane", "Ancient", "Forgotten",
    "Hidden", "Secret", "Whispering", "Shadowy", "Luminous", "Glowing",
    "Magnetic", "Sonic", "Crystal", "Diamond", "Emerald", "Ruby", "Sapphire",
    "Bronze", "Iron", "Steel", "Obsidian", "Molten", "Icy", "Blazing",
    "Stormy", "Windy", "Rainy", "Sunny", "Cloudy", "Misty", "Ethereal",
    "Nimble", "Swift", "Bold", "Noble", "Regal", "Royal", "Humble",
    "Gentle", "Savage", "Wild", "Primal", "Eternal", "Boundless", "Supreme",
    "Ultimate", "Perfect", "Flawless", "Broken", "Glitched", "Corrupted",
    "Sacred", "Hallowed", "Cursed", "Haunted", "Undead", "Living", "Breathing",
    "Mechanical", "Organic", "Temporal", "Spatial", "Abstract", "Concrete",
    "Logical", "Chaotic", "Mythic", "Legendary", "Epic", "Rare", "Common",
    # Expansion
    "Grand", "Great", "Small", "Tiny", "Huge", "Massive", "Micro", "Nano",
    "Quick", "Slow", "Fast", "Rapid", "Sudden", "Gradual", "Patient", "Eager",
    "Calm", "Angry", "Furious", "Peaceful", "Serene", "Turbulent", "Violent",
    "Kind", "Cruel", "Mean", "Nice", "Generous", "Stingy", "Selfish", "Altruistic",
    "Honest", "Deceitful", "True", "False", "Fake", "Genuine", "Authentic",
    "Loyal", "Treacherous", "Faithful", "Fickle", "Brave", "Cowardly", "Timid",
    "Fearless", "Courageous", "Daring", "Reckless", "Cautious", "Prudent",
    "Wise", "Foolish", "Ignorant", "Knowledgeable", "Learned", "Erudite",
    "Simple", "Complex", "Intricate", "Elaborate", "Plain", "Ornate", "Fancy",
    "Beautiful", "Ugly", "Hideous", "Gorgeous", "Attractive", "Repulsive",
    "Clean", "Dirty", "Filthy", "Pristine", "Pure", "Tainted", "Polluted",
    "Bright", "Dim", "Dark", "Gloomy", "Murky", "Shining", "Gleaming", "Dull",
    "Sharp", "Blunt", "Pointed", "Rounded", "Smooth", "Rough", "Coarse", "Fine",
    "Hard", "Soft", "Firm", "Flabby", "Rigid", "Flexible", "Pliant", "Stiff",
    "Heavy", "Light", "Weightless", "Dense", "Sparse", "Thick", "Thin",
    "Wide", "Narrow", "Broad", "Slim", "Fat", "Skinny", "Lean", "Stout",
    "Tall", "Short", "Long", "Brief", "High", "Low", "Deep", "Shallow",
    "Hot", "Cold", "Warm", "Cool", "Tepid", "Frigid", "Scalding", "Arctic",
    "Tropical", "Temperate", "Arid", "Humid", "Dry", "Wet", "Damp", "Soggy",
    "Loud", "Noisy", "Silent", "Mute", "Hushed", "Resonant", "Melodious",
    "Harmonious", "Discordant", "Cacophonous", "Sweet", "Sour", "Bitter",
    "Salty", "Spicy", "Savory", "Bland", "Tasty", "Delicious", "Nasty",
    "Fragrant", "Aromatic", "Pungent", "Stinky", "Odorous", "Scented",
    "Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Violet", "Indigo",
    "Pink", "Brown", "Black", "White", "Gray", "Beige", "Cream", "Maroon",
    "Navy", "Teal", "Aqua", "Lime", "Olive", "Gold", "Copper", "Platinum",
    "Chromatic", "Iridescent", "Opalescent", "Pearly", "Metallic", "Matte",
    "Glossy", "Transparent", "Translucent", "Opaque", "Clear", "Cloudy",
    "Young", "Old", "New", "Aged", "Antique", "Modern", "Futuristic", "Retro",
    "Primeval", "Prehistoric", "Medieval", "Victorian", "Contemporary",
    "Living", "Dead", "Undead", "Spectral", "Ghostly", "Phantom", "Corporeal",
    "Physical", "Mental", "Spiritual", "Emotional", "Psychic", "Astral",
    "Divine", "Infernal", "Demonic", "Angelic", "Celestial", "Fey", "Elemental",
    "Natural", "Artificial", "Synthetic", "Simulated", "Augmented", "Bionic",
    "Robotic", "Clockwork", "SteamPowered", "Nuclear", "SolarPowered", "WindPowered",
    "GeoThermal", "BioLuminescent", "Photosynthetic", "Radioactive", "Toxic",
    "Venomous", "Poisonous", "Inert", "Volatile", "Stable", "Unstable",
    "Explosive", "Implosive", "Acidic", "Alkaline", "Neutral", "Charged",
    "Magnetic", "Conductive", "Insulating", "Resistant", "Absorbent", "Reflective",
    "Emissive", "Stealthy", "Visible", "Invisible", "Camouflaged", "Disguised",
    "Known", "Unknown", "Familiar", "Strange", "Exotic", "Foreign", "Alien",
    "Native", "Indigenous", "Local", "Regional", "National", "Global", "Universal",
    "Public", "Private", "Personal", "Communal", "Collective", "Individual",
    "Open", "Closed", "Locked", "Sealed", "Guarded", "Protected", "Vulnerable",
    "Exposed", "Secure", "Insecure", "Safe", "Dangerous", "Hazardous", "Risky",
    "Beneficial", "Harmful", "Helpful", "Useless", "Useful", "Valuable",
    "Worthless", "Priceless", "Cheap", "Expensive", "Affordable", "Luxurious",
    "Basic", "Advanced", "Fundamental", "Essential", "Optional", "Mandatory",
    "Required", "Forbidden", "Permitted", "Legal", "Illegal", "Lawful", "Unlawful",
    "Ethical", "Unethical", "Moral", "Immoral", "Amoral", "Just", "Unjust",
    "Fair", "Unfair", "Right", "Wrong", "Correct", "Incorrect", "Accurate",
    "Inaccurate", "Precise", "Imprecise", "Vague", "Definite", "Ambiguous",
    "Certain", "Uncertain", "Probable", "Improbable", "Possible", "Impossible",
    "Real", "Unreal", "Imaginary", "Fictional", "Factual", "Symbolic", "Literal",
    "Abstract", "Figurative", "Empty", "Full", "Hollow", "Solid", "Filled",
    "Vacant", "Occupied", "Crowded", "Deserted", "Isolated", "Connected",
    "Linked", "Separate", "United", "Divided", "Whole", "Partial", "Complete",
    "Incomplete", "Finished", "Unfinished", "Perfect", "Imperfect", "Damaged",
    "Intact", "Operational", "Defective", "Functional", "Dysfunctional",
    "Healthy", "Sick", "Injured", "Wounded", "Healed", "Diseased", "Immune",
    "Alive", "Animated", "Inanimate", "Conscious", "Unconscious", "Sentient",
    "Sapient", "Intelligent", "Mindless", "Aware", "Oblivious", "Alert",
    "Drowsy", "Sleeping", "Awake", "Dreaming", "Lucid", "Nightmarish",
    "Hopeful", "Hopeless", "Optimistic", "Pessimistic", "Joyful", "Sorrowful",
    "Cheerful", "Gloomy", "Excited", "Bored", "Interested", "Indifferent",
    "Passionate", "Apathetic", "Loving", "Hateful", "Friendly", "Hostile",
    "Welcoming", "Suspicious", "Trusting", "Distrustful", "Gullible", "Skeptical",
    "Naive", "Cynical", "Innocent", "Guilty", "Blameless", "Responsible",
    "Free", "Captive", "Enslaved", "Liberated", "Independent", "Dependent",
    "Autonomous", "Subordinate", "Dominant", "Submissive", "Equal", "Unequal",
    "Superior", "Inferior", "Primary", "Secondary", "Tertiary", "Major", "Minor",
    "Significant", "Insignificant", "Crucial", "Trivial", "Urgent", "Routine",
    "Special", "Ordinary", "Normal", "Abnormal", "Typical", "Atypical",
    "Standard", "Custom", "Unique", "Generic", "Specific", "General",
    "Universal", "Particular", "Consistent", "Inconsistent", "Reliable",
    "Unreliable", "Predictable", "Unpredictable", "Stable", "Erratic",
    "Constant", "Variable", "Fixed", "Adjustable", "Static", "Dynamic",
    "Active", "Passive", "Inert", "Reactive", "Proactive", "Responsive",
    "Sensitive", "Insensitive", "Delicate", "Robust", "Fragile", "Durable",
    "Temporary", "Permanent", "Ephemeral", "Lasting", "Fleeting", "Enduring",
    "Ancient", "Timeless", "Momentary", "Instantaneous", "Protracted",
    "Forthcoming", "Past", "Present", "Future", "Initial", "Final", "Penultimate",
    "Sequential", "Simultaneous", "Concurrent", "Asynchronous", "Synchronous",
    "Parallel", "Serial", "Linear", "Nonlinear", "Cyclical", "Spiral",
    "Random", "Ordered", "Structured", "Unstructured", "Organized", "Disorganized",
    "Systematic", "Haphazard", "Methodical", "Intuitive", "Rational", "Irrational",
    "Logical", "Illogical", "Coherent", "Incoherent", "Articulate", "Inarticulate",
    "Eloquent", "Mumbling", "Fluent", "Stuttering", "Clear", "Obscure",
    "Explicit", "Implicit", "Direct", "Indirect", "Subtle", "Obvious",
    "Manifest", "Latent", "Overt", "Covert", "Public", "Confidential",
    "Classified", "TopSecret", "Unclassified", "Encoded", "Decoded", "Encrypted",
    "Plaintext", "Austere", "Lavish", "Minimalist", "Baroque", "Ornate",
    "Utilitarian", "Decorative", "Functional", "Ceremonial", "Ritualistic",
    "Sacrificial", "Consecrated", "Desecrated", "Blessed", "Cursed", "Enchanted",
    "Magical", "Mundane", "Ordinary", "Extraordinary", "Supernatural",
    "Paranormal", "Preternatural", "Otherworldly", "Uncanny", "Weird", "Bizarre",
    "Grotesque", "Surreal", "Absurd", "Comical", "Tragic", "Dramatic", "Lyrical",
    "Poetic", "Prosaic", "Musical", "Rhythmic", "Silent", "Still", "Moving",
    "Flowing", "Stagnant", "Vibrant", "Dull", "Energetic", "Lethargic",
    "Restless", "Peaceful", "Manic", "Depressed", "Anxious", "Relaxed",
    "Tense", "Loose", "Tight", "Slack", "Strained", "Comfortable", "Uncomfortable",
    "Painful", "Painless", "Pleasant", "Unpleasant", "Agreeable", "Disagreeable",
    "Satisfying", "Unsatisfying", "Fulfilling", "Frustrating", "Rewarding",
    "Punishing", "Addictive", "Repulsive", "Alluring", "Tempting", "Forbidden",
    "Sanctioned", "Approved", "Rejected", "Accepted", "Denied", "Confirmed",
    "Refuted", "Verified", "Unverified", "Proven", "Unproven", "Tested",
    "Untested", "Experimental", "Theoretical", "Practical", "Applied", "Pure",
    "Academic", "Vocational", "Professional", "Amateur", "Expert", "Novice",
    "Skilled", "Unskilled", "Talented", "Gifted", "Mediocre", "Incompetent",
    "Proficient", "Deficient", "Capable", "Incapable", "Able", "Unable",
    "Ready", "Unready", "Willing", "Unwilling", "Forced", "Voluntary",
    "Compulsory", "Elective", "Chosen", "Imposed", "Innate", "Acquired",
    "Inherited", "Learned", "Instinctive", "Conditioned", "Habitual", "Sporadic",
    "Frequent", "Infrequent", "Rare", "Ubiquitous", "Endemic", "Epidemic",
    "Pandemic", "Contagious", "Infectious", "Sterile", "Fertile", "Barren",
    "Productive", "Unproductive", "Fruitful", "Futile", "Effective", "Ineffective",
    "Efficient", "Inefficient", "Optimal", "Suboptimal", "Adequate", "Inadequate",
    "Sufficient", "Insufficient", "Abundant", "Scarce", "Plentiful", "Meager",
    "Rich", "Poor", "Wealthy", "Impoverished", "Prosperous", "Destitute",
    "Lucky", "Unlucky", "Fortunate", "Unfortunate", "Blessed", "Doomed",
    "Fated", "Random", "Destined", "Accidental", "Intentional", "Unintentional",
    "Deliberate", "Spontaneous", "Calculated", "Impulsive", "Planned", "Unplanned",
    "Expected", "Unexpected", "Surprising", "Predictable", "Inevitable", "Avoidable",
    "Escapable", "Inescapable", "Solvable", "Insolvable", "Answerable", "Unanswerable",
    "Known", "Unknowable", "Finite", "Measurable", "Immeasurable", "Comparable",
    "Incomparable", "Related", "Unrelated", "Relevant", "Irrelevant", "Appropriate",
    "Inappropriate", "Suitable", "Unsuitable", "Fitting", "Unfitting", "Seemly",
    "Unseemly", "Decent", "Indecent", "Modest", "Arrogant", "Proud", "Vain",
    "Humble", "Meek", "Assertive", "Aggressive", "Passive", "Docile", "Rebellious",
    "Compliant", "Defiant", "Obedient", "Disobedient", "Respectful", "Disrespectful",
    "Courteous", "Rude", "Polite", "Impolite", "Considerate", "Inconsiderate",
    "Thoughtful", "Thoughtless", "Tactful", "Tactless", "Diplomatic", "Blunt",
    "Subtle", "Frank", "Candid", "Reserved", "Outgoing", "Introverted", "Extroverted",
    "Ambiverted", "Sociable", "Antisocial", "Solitary", "Gregarious", "Aloof",
    "Approachable", "Distant", "Warm", "Cold", "Friendly", "Unfriendly", "Charming",
    "Repellent", "Engaging", "Boring", "Interesting", "Dull", "Fascinating",
    "Tedious", "Stimulating", "Monotonous", "Varied", "Diverse", "Homogeneous",
    "Uniform", "Eclectic", "Assorted", "Miscellaneous", "Purebred", "Hybrid",
    "Mixed", "Segregated", "Integrated", "Unified", "Fragmented", "Cohesive",
    "Disparate", "Congruent", "Incongruent", "Compatible", "Incompatible",
    "Harmonious", "Clashing", "Aligned", "Misaligned", "Balanced", "Unbalanced",
    "Symmetrical", "Asymmetrical", "Centered", "OffCenter", "Level", "Slanted",
    "Vertical", "Horizontal", "Diagonal", "Perpendicular", "Parallel", "Intersecting",
    "Tangent", "Concentric", "Eccentric", "Orthogonal", "Radial", "Axial",
    "Spherical", "Cubical", "Conical", "Cylindrical", "Planar", "Volumetric",
    "Holographic", "Fractal", "Recursive", "Iterative", "Generative", "Procedural",
    "Algorithmic", "Heuristic", "Stochastic", "Deterministic", "Emergent", "Complex",
    "Networked", "Distributed", "Centralized", "Decentralized", "PeerToPeer",
    "Hierarchical", "Flat", "Layered", "Nested", "Interconnected", "Intertwined",
    "Woven", "Knitted", "Braided", "Fused", "Welded", "Bolted", "Glued",
    "Stitched", "Bound", "Loose", "Free", "Contained", "Released", "Captured",
    "Escaped", "Wild", "Domesticated", "Feral", "Tame", "Savage", "Civilized",
    "Primitive", "Advanced", "Rudimentary", "Sophisticated", "Crude", "Refined",
    "Polished", "RoughHewn", "Raw", "Cooked", "Processed", "Natural", "Organic",
    "Synthetic", "Artificial", "Genuine", "Counterfeit", "Imitation", "Original",
    "Reproduction", "Authentic", "Spurious", "Legitimate", "Illegitimate",
    "Valid", "Invalid", "Sound", "Fallacious", "True", "Misleading", "Erroneous"
]))

OBJECTS = list(set([
    # Core
    "Wizardry", "Maven", "Account", "Squad", "Tips", "Night", "Life",
    "Dreams", "Setup", "Warrior", "Dad", "Moments", "Gram", "Fotos",
    "Tales", "Key", "Gem", "Crown", "Sword", "Shield", "Orb", "Crystal",
    "Book", "Star", "Planet", "Cloud", "Tree", "River", "Mountain",
    "City", "Code", "Pixel", "Byte", "Note", "Rhythm", "Brush", "Canvas",
    "Machine", "Network", "Engine", "Galaxy", "Universe", "Dimension",
    "Realm", "Kingdom", "Empire", "Citadel", "Fortress", "Tower", "Dungeon",
    "Cavern", "Labyrinth", "Portal", "Gate", "Rune", "Sigil", "Talisman",
    "Amulet", "Relic", "Artifact", "Scroll", "Tome", "Codex", "Grimoire",
    "Map", "Compass", "Sextant", "Telescope", "Microscope", "Elixir", "Potion",
    "Flask", "Vial", "Herb", "Root", "Seed", "Spore", "Gemstone", "Scepter",
    "Wand", "Staff", "Blade", "Dagger", "Arrow", "Bow", "Axe", "Hammer",
    "Armor", "Helmet", "Gauntlet", "Boot", "Cloak", "Ring", "Throne", "Altar",
    "Forge", "Anvil", "Loom", "Quill", "Ink", "Parchment", "Pigment", "Clay",
    "Stone", "Wood", "Metal", "Glass", "Circuit", "Wire", "Chip", "Core",
    "Matrix", "Grid", "Node", "Server", "Database", "Algorithm", "Script",
    "Glitch", "Bug", "Patch", "Mod", "Console", "Controller", "Keyboard",
    "Mouse", "Headset", "Monitor", "Stream", "Channel", "Feed", "Echo",
    "Signal", "Wave", "Particle", "Atom", "Molecule", "Sun", "Moon", "Comet",
    "Asteroid", "Nebula", "Void", "Abyss", "Nexus", "Heart", "Soul", "Mind",
    "Spirit", "Nightmare", "Memory", "Thought", "Idea", "Concept", "Theory",
    "Law", "Rule", "Quest", "Journey", "Saga", "Legend", "Myth", "Fable",
    "Story", "Song", "Melody", "Harmony", "Beat", "Pulse", "Silence",
    "Shadow", "Light", "Dark", "Dawn", "Dusk", "Twilight", "Midnight",
    "Noon", "Sky", "Rain", "Snow", "Wind", "Storm", "Fire", "Flame",
    "Ember", "Ash", "Water", "Ocean", "Sea", "Lake", "Pond", "Tide",
    "Earth", "Soil", "Sand", "Dust", "Rock", "Valley", "Forest", "Grove",
    "Leaf", "Branch", "Flower", "Thorn", "Vine", "Moss", "Fungus", "Beast",
    "Creature", "Monster", "Dragon", "Phoenix", "Griffin", "Unicorn", "Wolf",
    "Bear", "Eagle", "Raven", "Serpent", "Spider", "Scarab", "Data", "Info",
    "Knowledge", "Wisdom", "Power", "Force", "Energy", "Magic", "Source",
    "Lock", "Chain", "Puzzle", "Riddle", "Secret", "Clue", "Truth", "Lie",
    "Hope", "Fear", "Joy", "Sorrow", "Anger", "Peace", "Chaos", "Order",
    "Death", "Fate", "Destiny", "Time", "Space", "Reality", "Illusion", "Specter",
    # Expansion
    "Castle", "Keep", "Manor", "Villa", "Palace", "Temple", "Shrine", "Monastery",
    "Abbey", "Cathedral", "Church", "Chapel", "Mosque", "Synagogue", "Pagoda",
    "Pyramid", "Ziggurat", "Mausoleum", "Tomb", "Crypt", "Catacomb", "Ossuary",
    "Hut", "Cabin", "Cottage", "House", "Home", "Apartment", "Condo", "Studio",
    "Loft", "Penthouse", "Mansion", "Estate", "Chateau", "Bungalow", "Townhouse",
    "Shack", "Tent", "Yurt", "Igloo", "Treehouse", "Cave", "Burrow", "Nest",
    "Hive", "Lair", "Den", "Sanctuary", "Refuge", "Haven", "Oasis", "Island",
    "Peninsula", "Continent", "Archipelago", "Volcano", "Geyser", "HotSpring",
    "Glacier", "Iceberg", "Fjord", "Canyon", "Gorge", "Ravine", "Plateau",
    "Mesa", "Butte", "Hill", "Peak", "Summit", "Ridge", "Cliff", "Crag",
    "Beach", "Shore", "Coast", "Delta", "Estuary", "Bay", "Gulf", "Strait",
    "Channel", "Sound", "Lagoon", "Marsh", "Swamp", "Bog", "Fen", "Wetland",
    "Tundra", "Taiga", "Savanna", "Prairie", "Steppe", "Desert", "Wasteland",
    "Jungle", "Rainforest", "Woodland", "Thicket", "Copse", "Meadow", "Field",
    "Pasture", "Garden", "Orchard", "Vineyard", "Farm", "Ranch", "Plantation",
    "Road", "Path", "Trail", "Track", "Street", "Avenue", "Boulevard", "Highway",
    "Freeway", "Bridge", "Tunnel", "Overpass", "Underpass", "Canal", "Aqueduct",
    "Dam", "Reservoir", "Well", "Cistern", "Fountain", "Pipeline", "Sewer",
    "Mine", "Quarry", "OilRig", "WindTurbine", "SolarPanel", "PowerPlant",
    "Factory", "Workshop", "Mill", "Refinery", "Warehouse", "Silo", "Granary",
    "Depot", "Hangar", "Dock", "Pier", "Wharf", "Harbor", "Port", "Airport",
    "Station", "Terminal", "Platform", "Stop", "Market", "Bazaar", "Mall",
    "Shop", "Store", "Boutique", "Emporium", "Gallery", "Museum", "Library",
    "Archive", "School", "University", "College", "Academy", "Institute",
    "Laboratory", "Observatory", "Studio", "Theater", "Cinema", "Amphitheater",
    "Arena", "Stadium", "Colosseum", "Gymnasium", "Spa", "Bathhouse", "Hospital",
    "Clinic", "Infirmary", "Asylum", "Sanitarium", "Orphanage", "Prison", "Jail",
    "Barracks", "Garrison", "Armory", "Arsenal", "Bunker", "Trench", "Wall",
    "Fence", "Barricade", "Moat", "Rampart", "Parapet", "Battlement", "Watchtower",
    "Lighthouse", "BellTower", "ClockTower", "Spire", "Steeple", "Dome", "Arch",
    "Column", "Pillar", "Statue", "Monument", "Obelisk", "Fresco", "Mural",
    "Tapestry", "Mosaic", "StainedGlass", "Sculpture", "Painting", "Drawing",
    "Sketch", "Etching", "Engraving", "Photograph", "Hologram", "Blueprint",
    "Diagram", "Schematic", "Manuscript", "Document", "Letter", "Journal",
    "Diary", "Ledger", "Logbook", "Manifest", "Treaty", "Contract", "Deed",
    "Will", "Testament", "Proclamation", "Decree", "Edict", "Charter", "Constitution",
    "Scripture", "Gospel", "Sutra", "Veda", "Koran", "Torah", "Bible", "Hymn",
    "Prayer", "Chant", "Mantra", "Incantation", "Spell", "Curse", "Blessing",
    "Prophecy", "Omen", "Sign", "Token", "Symbol", "Emblem", "Crest", "Banner",
    "Flag", "Standard", "Pennant", "Badge", "Insignia", "Medal", "Ribbon",
    "Coin", "Currency", "Note", "Bill", "Token", "Chip", "Bar", "Ingot", "Nugget",
    "Dust", "Powder", "Crystal", "Shard", "Fragment", "Piece", "Slice", "Lump",
    "Block", "Slab", "Sheet", "Plate", "Rod", "Bar", "Wire", "Cable", "Fiber",
    "Thread", "String", "Rope", "Cord", "Twine", "Yarn", "Fabric", "Cloth",
    "Textile", "Leather", "Hide", "Pelt", "Fur", "Wool", "Cotton", "Silk",
    "Linen", "Hemp", "Canvas", "Paper", "Cardboard", "Plastic", "Rubber",
    "Ceramic", "Porcelain", "Earthenware", "Brick", "Tile", "Concrete", "Asphalt",
    "Tar", "Resin", "Amber", "Jet", "Ivory", "Bone", "Horn", "Antler", "Shell",
    "Pearl", "Coral", "Scale", "Feather", "Tooth", "Claw", "Talon", "Fang",
    "Venom", "Antidote", "Toxin", "Acid", "Base", "Solvent", "Catalyst", "Reagent",
    "Compound", "Mixture", "Solution", "Suspension", "Emulsion", "Gel", "Foam",
    "Aerosol", "Smoke", "Vapor", "Gas", "Liquid", "Solid", "Plasma", "Slime",
    "Ooze", "Goo", "Mud", "Silt", "Clay", "Loam", "Gravel", "Pebble", "Boulder",
    "Meteorite", "Tektite", "Geode", "Fossil", "PetrifiedWood", "Coal", "Graphite",
    "Diamond", "Quartz", "Feldspar", "Mica", "Granite", "Basalt", "Marble",
    "Slate", "Sandstone", "Limestone", "Chalk", "Flint", "Obsidian", "Pumice",
    "Sulfur", "Salt", "Potash", "Nitrate", "Alum", "Borax", "Gypsum", "Talc",
    "Asbestos", "IronOre", "CopperOre", "GoldOre", "SilverOre", "TinOre",
    "LeadOre", "ZincOre", "NickelOre", "AluminumOre", "UraniumOre", "TitaniumOre",
    "Platinum", "Palladium", "Rhodium", "Osmium", "Iridium", "Mercury",
    "Arsenic", "Antimony", "Bismuth", "Cadmium", "Chromium", "Cobalt",
    "Manganese", "Molybdenum", "Tungsten", "Vanadium", "Zirconium", "Gallium",
    "Germanium", "Indium", "Selenium", "Tellurium", "Polonium", "Astatine",
    "Radon", "Francium", "Radium", "Actinium", "Thorium", "Protactinium",
    "Neptunium", "Plutonium", "Americium", "Curium", "Berkelium", "Californium",
    "Einsteinium", "Fermium", "Mendelevium", "Nobelium", "Lawrencium",
    "Rutherfordium", "Dubnium", "Seaborgium", "Bohrium", "Hassium", "Meitnerium",
    "Darmstadtium", "Roentgenium", "Copernicium", "Nihonium", "Flerovium",
    "Moscovium", "Livermorium", "Tennessine", "Oganesson", "Element",
    "Isotope", "Ion", "Cation", "Anion", "Proton", "Neutron", "Electron",
    "Photon", "Quark", "Lepton", "Boson", "Fermion", "Gluon", "Graviton",
    "Neutrino", "Antimatter", "DarkMatter", "DarkEnergy", "Singularity",
    "BlackHole", "WhiteHole", "Wormhole", "Quasar", "Pulsar", "Magnetar",
    "Supernova", "Hypernova", "RedGiant", "WhiteDwarf", "BrownDwarf", "NeutronStar",
    "Protostar", "MainSequence", "Constellation", "Asterism", "Cluster", "Group",
    "Supercluster", "Filament", "Wall", "Void", "CosmicMicrowaveBackground",
    "BigBang", "Inflation", "Multiverse", "Hyperspace", "Subspace", "Slipstream",
    "WarpDrive", "JumpDrive", "Teleporter", "Stargate", "Transporter", "Replicator",
    "Holodeck", "Phaser", "Blaster", "Lightsaber", "ForceField", "DeflectorShield",
    "TractorBeam", "CloakingDevice", "SensorArray", "Communicator", "Tricorder",
    "UniversalTranslator", "Cyberdeck", "NeuralInterface", "Exoskeleton", "CyborgImplant",
    "BionicArm", "ArtificialEye", "SyntheticOrgan", "GeneMod", "Vat", "Clone",
    "Android", "Robot", "Drone", "Automaton", "Golem", "Homunculus", "Gargoyle",
    "Chimera", "Manticore", "Hydra", "Cerberus", "Cyclops", "Giant", "Titan",
    "Ogre", "Troll", "Goblin", "Orc", "Kobold", "Gremlin", "Imp", "Demon", "Devil",
    "Angel", "Archangel", "Seraph", "Cherub", "Valkyrie", "Nymph", "Dryad", "Sprite",
    "Pixie", "Fairy", "Leprechaun", "Gnome", "Dwarf", "Elf", "Hobbit", "Halfling",
    "Centaur", "Satyr", "Faun", "Minotaur", "Harpy", "Siren", "Mermaid", "Merman",
    "Naga", "Lamia", "Gorgon", "Medusa", "Sphinx", "Basilisk", "Cockatrice",
    "Wyvern", "Roc", "Kraken", "Leviathan", "Behemoth", "Juggernaut", "Werewolf",
    "Vampire", "Lich", "Ghoul", "Zombie", "Mummy", "Skeleton", "Ghost", "Phantom",
    "Specter", "Wraith", "Poltergeist", "Banshee", "Shade", "Doppelganger",
    "Shapeshifter", "Illusion", "Mirage", "Phantasm", "Hallucination", "Apparition",
    "Entity", "Being", "Essence", "Presence", "Aura", "Emanation", "Vibration",
    "Frequency", "Wavelength", "Spectrum", "Color", "Hue", "Tint", "Shade",
    "Tone", "Sound", "Noise", "Pitch", "Volume", "Timbre", "Resonance", "Silence",
    "Scent", "Odor", "Aroma", "Fragrance", "Stench", "Taste", "Flavor", "Aftertaste",
    "Texture", "Feel", "Grain", "Temperature", "Pressure", "Weight", "Mass",
    "Density", "Volume", "Area", "Length", "Width", "Height", "Depth", "Distance",
    "Proximity", "Angle", "Curve", "Line", "Point", "Shape", "Form", "Structure",
    "Pattern", "Design", "Composition", "Layout", "Arrangement", "Configuration",
    "System", "Mechanism", "Device", "Apparatus", "Instrument", "Tool", "Utensil",
    "Gadget", "Contraption", "Widget", "Gizmo", "Thingamajig", "Doodad", "Item",
    "Object", "Article", "Commodity", "Product", "Goods", "Wares", "Merchandise",
    "Supplies", "Provisions", "Equipment", "Gear", "Tackle", "Kit", "Outfit",
    "Apparel", "Clothing", "Garment", "Attire", "Vestment", "Raiment", "Costume",
    "Uniform", "Jewelry", "Accessory", "Adornment", "Trinket", "Bauble", "Knickknack",
    "Souvenir", "Memento", "Heirloom", "Treasure", "Prize", "Reward", "Bounty",
    "Loot", "Spoils", "Plunder", "Trophy", "Gift", "Present", "Offering", "Tribute",
    "Donation", "Alms", "Charity", "Sacrifice", "Libation", "Incense", "Candle",
    "Torch", "Lantern", "Lamp", "Lightbulb", "Laser", "Beam", "Ray", "Glimmer",
    "Spark", "Flash", "Glow", "Shimmer", "Glitter", "Reflection", "Refraction",
    "Diffraction", "Interference", "Polarization", "Lense", "Mirror", "Prism",
    "Filter", "Screen", "Monitor", "Display", "Projector", "Camera", "Binoculars",
    "MagnifyingGlass", "Eyeglasses", "ContactLense", "Microphone", "Speaker",
    "Headphones", "Earbuds", "Amplifier", "Receiver", "Transmitter", "Antenna",
    "SatelliteDish", "Modem", "Router", "Switch", "Hub", "Firewall", "Proxy",
    "VPN", "Cable", "Connector", "Port", "Jack", "Plug", "Socket", "Adapter",
    "Battery", "PowerSupply", "Generator", "Capacitor", "Resistor", "Transistor",
    "Diode", "Inductor", "IntegratedCircuit", "Microprocessor", "MemoryChip",
    "HardDrive", "SSD", "FlashDrive", "OpticalDisc", "FloppyDisk", "TapeDrive",
    "Motherboard", "CPU", "GPU", "RAM", "ROM", "BIOS", "OperatingSystem", "Software",
    "Application", "Program", "App", "Utility", "Driver", "Firmware", "Malware",
    "Virus", "Worm", "Trojan", "Ransomware", "Spyware", "Adware", "Keylogger",
    "Rootkit", "Botnet", "Firewall", "Antivirus", "Sandbox", "Honeypot",
    "EncryptionKey", "Password", "Passphrase", "Biometric", "Fingerprint",
    "RetinaScan", "Voiceprint", "FaceRecognition", "Token", "Certificate",
    "DigitalSignature", "Blockchain", "Cryptocurrency", "Bitcoin", "Ethereum",
    "NFT", "SmartContract", "Ledger", "Transaction", "Block", "Hash", "Wallet",
    "Exchange", "MiningRig", "Node", "Protocol", "Algorithm", "Heuristic",
    "Function", "Variable", "Constant", "Parameter", "Argument", "Loop",
    "Condition", "Statement", "Expression", "Syntax", "Semantics", "Compiler",
    "Interpreter", "Debugger", "IDE", "TextEditor", "VersionControl", "Repository",
    "Branch", "Merge", "Commit", "Push", "Pull", "Clone", "Fork", "API", "SDK",
    "Library", "Framework", "Module", "Package", "Dependency", "Class", "Object",
    "Method", "Attribute", "Inheritance", "Polymorphism", "Encapsulation",
    "Abstraction", "Interface", "DesignPattern", "Architecture", "Model", "View",
    "Controller", "DatabaseSchema", "Table", "Row", "Column", "Index", "Query",
    "SQL", "NoSQL", "JSON", "XML", "CSV", "YAML", "HTML", "CSS", "JavaScript",
    "Python", "Java", "C++", "CSharp", "Ruby", "PHP", "Swift", "Kotlin", "Go",
    "Rust", "TypeScript", "Assembly", "MachineCode", "Binary", "Hexadecimal",
    "Decimal", "Octal", "Character", "String", "Integer", "Float", "Boolean",
    "Array", "List", "Tuple", "Set", "Dictionary", "Map", "Graph", "Tree",
    "Stack", "Queue", "LinkedList", "Heap", "Bit", "Flag", "Mask", "Pointer",
    "Reference", "Handle", "Address", "Buffer", "Cache", "Stream", "File",
    "Directory", "Path", "URL", "URI", "DomainName", "IP_Address", "MAC_Address",
    "PortNumber", "Socket", "Packet", "Frame", "Datagram", "Segment", "ProtocolStack",
    "OSI_Model", "TCP_IP", "HTTP", "HTTPS", "FTP", "SSH", "SMTP", "POP3", "IMAP",
    "DNS", "DHCP", "UDP", "ICMP", "ARP", "Ethernet", "WiFi", "Bluetooth", "NFC",
    "Cellular", "Satellite", "FiberOptic", "CopperWire", "RadioWave", "Microwave",
    "Infrared", "Ultraviolet", "XRay", "GammaRay", "VisibleLight", "SoundWave",
    "Ultrasound", "Infrasound", "SeismicWave", "GravityWave", "Shockwave",
    "BlastWave", "TidalWave", "Tsunami", "Ripple", "Current", "Eddy", "Vortex",
    "Whirlpool", "Waterspout", "Tornado", "Hurricane", "Typhoon", "Cyclone",
    "Blizzard", "Thunderstorm", "Lightning", "Thunder", "Hail", "Sleet", "Fog",
    "Smog", "Haze", "Mist", "Dew", "Frost", "Ice", "Snowflake", "Avalanche",
    "Landslide", "Mudslide", "Earthquake", "Aftershock", "Tremor", "Eruption",
    "Lava", "Magma", "AshCloud", "PyroclasticFlow", "Caldera", "Crater",
    "Fissure", "Vent", "FaultLine", "TectonicPlate", "Mantle", "OuterCore",
    "InnerCore", "Crust", "Atmosphere", "Troposphere", "Stratosphere", "Mesosphere",
    "Thermosphere", "Exosphere", "Ionosphere", "Magnetosphere", "OzoneLayer",
    "VanAllenBelt", "Aurora", "Meteor", "Meteoroid", "ShootingStar", "Fireball",
    "Bolide", "AsteroidBelt", "KuiperBelt", "OortCloud", "InterstellarMedium",
    "IntergalacticSpace", "LocalGroup", "VirgoSupercluster", "Laniakea",
    "ObservableUniverse", "CosmicWeb", "EventHorizon", "Spacetime", "Continuum",
    "FabricOfReality", "AlternateDimension", "PocketUniverse", "AstralPlane",
    "EtherealPlane", "Feywild", "Shadowfell", "ElementalPlane", "Heavens",
    "Hells", "Limbo", "Purgatory", "Valhalla", "Elysium", "Underworld", "Afterlife",
    "Reincarnation", "Nirvana", "Enlightenment", "Ascension", "Transcendence",
    "Deity", "God", "Goddess", "Pantheon", "Mythology", "Cosmology", "Theology",
    "Philosophy", "Ideology", "Doctrine", "Dogma", "Creed", "Belief", "Faith",
    "Doubt", "Heresy", "Blasphemy", "Apostasy", "Schism", "Cult", "Sect",
    "Religion", "Spirituality", "Atheism", "Agnosticism", "Humanism", "Secularism",
    "Nihilism", "Existentialism", "Stoicism", "Epicureanism", "Cynicism",
    "Hedonism", "Utilitarianism", "Rationalism", "Empiricism", "Idealism",
    "Materialism", "Dualism", "Monism", "Determinism", "FreeWill", "Predestination",
    "Karma", "Dharma", "Samsara", "Moksha", "Tao", "Chi", "Yin", "Yang", "Zen",
    "Koan", "Satori", "Yoga", "Meditation", "Mindfulness", "Prayer", "Ritual",
    "Ceremony", "Sacrament", "Initiation", "Pilgrimage", "Fasting", "Feast",
    "Festival", "Holiday", "Sabbath", "Jubilee", "Tradition", "Custom", "Etiquette",
    "Manners", "Protocol", "CodeOfConduct", "HonorCode", "Oath", "Vow", "Pledge",
    "Promise", "Contract", "Agreement", "Treaty", "Alliance", "Pact", "Covenant",
    "Law", "Statute", "Ordinance", "Regulation", "Rule", "Precedent", "Jurisprudence",
    "Justice", "Equity", "Fairness", "Rights", "Freedoms", "Liberties", "Duties",
    "Responsibilities", "Obligations", "Privileges", "Immunities", "Crime",
    "Felony", "Misdemeanor", "Infraction", "Violation", "Offense", "Transgression",
    "Sin", "Vice", "Virtue", "Merit", "Demerit", "Punishment", "Penalty",
    "Fine", "Sentence", "Imprisonment", "Execution", "Exile", "Banishment",
    "Ostracism", "Shunning", "Reputation", "Honor", "Shame", "Glory", "Infamy",
    "Fame", "Notoriety", "Legacy", "Heritage", "Lineage", "Ancestry", "Descendants",
    "Family", "Clan", "Tribe", "Nation", "Race", "Ethnicity", "Culture", "Society",
    "Civilization", "Community", "Neighborhood", "Village", "Town", "Metropolis",
    "Megalopolis", "State", "Province", "Territory", "Country", "Federation",
    "Confederation", "Union", "Alliance", "Coalition", "Organization", "Institution",
    "Corporation", "Company", "Business", "Enterprise", "Startup", "NonProfit",
    "Foundation", "Association", "Guild", "Union", "Club", "Society", "Fraternity",
    "Sorority", "Team", "Crew", "Gang", "Mob", "Syndicate", "Cartel", "Cult",
    "Faction", "Party", "Movement", "Government", "Monarchy", "Republic",
    "Democracy", "Theocracy", "Autocracy", "Oligarchy", "Anarchy", "Dictatorship",
    "Totalitarianism", "Feudalism", "Capitalism", "Socialism", "Communism",
    "Fascism", "Nationalism", "Imperialism", "Colonialism", "Globalism",
    "Federalism", "Separatism", "Populism", "Liberalism", "Conservatism",
    "Progressivism", "Libertarianism", "Environmentalism", "Feminism", "Pacifism",
    "Militarism", "Revolution", "Rebellion", "Uprising", "Coup", "Insurrection",
    "CivilWar", "War", "Battle", "Skirmish", "Siege", "Campaign", "Conflict",
    "Truce", "Ceasefire", "Armistice", "PeaceTreaty", "Diplomacy", "Negotiation",
    "Embargo", "Sanctions", "Espionage", "Intelligence", "Propaganda", "Sabotage",
    "Terrorism", "CounterTerrorism", "Resistance", "Underground", "Dissident",
    "Refugee", "AsylumSeeker", "DisplacedPerson", "Casualty", "Veteran",
    "Memorial", "Monument", "History", "Prehistory", "Antiquity", "MiddleAges",
    "Renaissance", "Enlightenment", "IndustrialRevolution", "InformationAge",
    "Future", "Utopia", "Dystopia", "Apocalypse", "PostApocalypse", "Armageddon",
    "Ragnarok", "JudgmentDay", "EndTimes", "NewBeginning", "GoldenAge",
    "DarkAge", "Epoch", "Era", "Period", "Millennium", "Century", "Decade",
    "Year", "Season", "Month", "Week", "Day", "Hour", "Minute", "Second",
    "Moment", "Instant", "Eternity", "Infinity", "Continuum", "Cycle", "Rhythm",
    "Tempo", "Cadence", "Frequency", "Interval", "Duration", "Timeline",
    "Schedule", "Calendar", "Almanac", "Chronicle", "Annals", "Record", "Log",
    "Journal", "Diary", "Memoir", "Biography", "Autobiography", "Novel",
    "ShortStory", "Novella", "Epic", "Poem", "Ballad", "Sonnet", "Haiku",
    "Limerick", "Verse", "Prose", "Play", "Script", "Screenplay", "Libretto",
    "Lyrics", "Score", "SheetMusic", "Symphony", "Concerto", "Sonata", "Opera",
    "Ballet", "Musical", "Oratorio", "Cantata", "Fugue", "Overture", "Suite",
    "Aria", "Chorus", "Recitative", "Etude", "Nocturne", "Prelude", "Rhapsody",
    "Waltz", "March", "Anthem", "Hymn", "Carol", "Chant", "Madrigal", "Motet",
    "FolkSong", "Blues", "Jazz", "Rock", "Pop", "HipHop", "Electronic", "Classical",
    "WorldMusic", "Ambient", "Soundtrack", "Jingle", "ThemeSong", "Lullaby",
    "NurseryRhyme", "Riddle", "Proverb", "Maxim", "Aphorism", "Epigram", "Quote",
    "Slogan", "Motto", "Catchphrase", "Buzzword", "Jargon", "Slang", "Dialect",
    "Accent", "Language", "Alphabet", "Character", "Glyph", "Ideogram", "Logogram",
    "Syllabary", "Phoneme", "Morpheme", "Word", "Phrase", "Clause", "Sentence",
    "Paragraph", "Chapter", "Volume", "Text", "Speech", "Lecture", "Sermon",
    "Debate", "Discussion", "Conversation", "Dialogue", "Monologue", "Soliloquy",
    "Narration", "Description", "Exposition", "Argument", "Rhetoric", "Logic",
    "Reason", "Emotion", "Passion", "Instinct", "Intuition", "Conscience",
    "Morality", "Ethics", "Aesthetics", "Beauty", "Sublime", "Art", "Craft",
    "Skill", "Technique", "Talent", "Genius", "Creativity", "Imagination",
    "Inspiration", "Muse", "Medium", "Style", "Genre", "Movement", "School",
    "Masterpiece", "WorkOfArt", "Oeuvre", "Canon", "Critique", "Review",
    "Analysis", "Interpretation", "Theory", "Hypothesis", "Experiment",
    "Observation", "Measurement", "Data", "Evidence", "Proof", "Conclusion",
    "Discovery", "Invention", "Innovation", "Technology", "Science", "Mathematics",
    "Physics", "Chemistry", "Biology", "Astronomy", "Geology", "Ecology",
    "Medicine", "Engineering", "ComputerScience", "Psychology", "Sociology",
    "Anthropology", "Economics", "PoliticalScience", "History", "Linguistics",
    "Philosophy", "Literature", "Musicology", "ArtHistory", "Theology",
    "Education", "Pedagogy", "Curriculum", "Lesson", "Lecture", "Seminar",
    "Workshop", "Tutorial", "Exam", "Test", "Quiz", "Assignment", "Homework",
    "Project", "Thesis", "Dissertation", "Diploma", "Degree", "Certificate",
    "License", "Qualification", "Credential", "Skillset", "Expertise", "Competence",
    "Proficiency", "Mastery", "KnowledgeBase", "Wisdom", "Understanding",
    "Insight", "Awareness", "Perception", "Cognition", "Memory", "Recall",
    "Recognition", "Learning", "Attention", "Concentration", "Focus", "Distraction",
    "ThoughtProcess", "ProblemSolving", "DecisionMaking", "Judgment", "Bias",
    "Heuristic", "Fallacy", "LogicError", "CognitiveDissonance", "Mindset",
    "Attitude", "Perspective", "Worldview", "Paradigm", "FrameOfReference",
    "BeliefSystem", "ValueSystem", "Motivation", "Drive", "Ambition", "Goal",
    "Objective", "Purpose", "Meaning", "Intention", "Willpower", "Discipline",
    "Habit", "Routine", "Emotion", "Feeling", "Mood", "Temperament", "Personality",
    "Character", "Trait", "Disposition", "Behavior", "Action", "Reaction",
    "Response", "Interaction", "Relationship", "Bond", "Connection", "Attachment",
    "Affection", "Love", "Lust", "Infatuation", "Friendship", "Companionship",
    "Rivalry", "Enmity", "Hatred", "Antipathy", "Indifference", "Empathy",
    "Sympathy", "Compassion", "Kindness", "Cruelty", "Generosity", "Greed",
    "Envy", "Jealousy", "Pride", "Humility", "Anger", "Rage", "Irritation",
    "Annoyance", "Frustration", "Disappointment", "Sadness", "Grief", "Sorrow",
    "Melancholy", "Despair", "Hope", "Optimism", "Pessimism", "Joy", "Happiness",
    "Elation", "Ecstasy", "Bliss", "Contentment", "Satisfaction", "Gratitude",
    "Regret", "Remorse", "Guilt", "Shame", "Embarrassment", "Anxiety", "Worry",
    "Fear", "Terror", "Panic", "Phobia", "Stress", "Tension", "Relaxation",
    "Calm", "Serenity", "Peace", "Tranquility", "Excitement", "Thrill",
    "Anticipation", "Suspense", "Surprise", "Amazement", "Awe", "Wonder",
    "Curiosity", "Boredom", "Apathy", "Lethargy", "Fatigue", "Energy",
    "Vitality", "Vigor", "Stamina", "Endurance", "Strength", "Power", "Weakness",
    "Fragility", "Resilience", "Toughness", "Hardiness", "Agility", "Dexterity",
    "Coordination", "Balance", "Flexibility", "Speed", "Quickness", "Reflexes",
    "Accuracy", "Precision", "Steadiness", "Health", "Wellness", "Sickness",
    "Illness", "Disease", "Malady", "Ailment", "Condition", "Disorder",
    "Syndrome", "Injury", "Wound", "Trauma", "Pain", "Ache", "Soreness",
    "Comfort", "Discomfort", "Pleasure", "Displeasure", "Sensation", "Perception",
    "Sight", "Vision", "Hearing", "Audition", "Smell", "Olfaction", "Taste",
    "Gustation", "Touch", "Tactition", "Proprioception", "Nociception",
    "Thermoception", "Equilibrioception", "Chronoception", "Interoception",
    "Sense", "Instinct", "GutFeeling", "Hunch", "Premonition", "Clairvoyance",
    "Telepathy", "Telekinesis", "Precognition", "Retrocognition", "Psychometry",
    "AstralProjection", "Mediumship", "Channeling", "Divination", "Scrying",
    "Augury", "Tarot", "Runes", "Astrology", "Numerology", "Palmistry",
    "Geomancy", "Chiromancy", "Cartomancy", "Oneiromancy", "Necromancy",
    "Alchemy", "Thaumaturgy", "Sorcery", "Witchcraft", "Wizardry", "Enchantment",
    "Conjuration", "Summoning", "Invocation", "Evocation", "Abjuration",
    "Transmutation", "Illusion", "Divination", "Restoration", "Destruction",
    "Alteration", "Mysticism", "Occultism", "Esotericism", "Gnosticism",
    "Hermeticism", "Kabbalah", "Theosophy", "Wicca", "Paganism", "Shamanism",
    "Animism", "Polytheism", "Monotheism", "Pantheism", "Panentheism", "Deism",
    "Agnosticism", "Atheism", "Humanism", "Secularism"
]))

ACTIONS_VERBS = list(set([
    # Core
    "Coding", "Gaming", "Writing", "Reading", "Drawing", "Singing",
    "Dancing", "Running", "Jumping", "Building", "Exploring", "Crafting",
    "Dreaming", "Living", "Growing", "Creating", "Sailing", "Flying",
    "Fighting", "Casting", "Healing", "Stealing", "Forging", "Analyzing",
    "Synthesizing", "Navigating", "Awakening", "Converging", "Hacking",
    "Streaming", "Designing", "Composing", "Painting", "Sculpting", "Brewing",
    "Enchanting", "Conjuring", "Summoning", "Banishing", "Protecting",
    "Defending", "Attacking", "Striking", "Dodging", "Sneaking", "Tracking",
    "Hunting", "Trapping", "Taming", "Riding", "Diving", "Swimming",
    "Climbing", "Crawling", "Sprinting", "Leaping", "Falling", "Rising",
    "Ascending", "Descending", "Teleporting", "Phasing", "Shifting", "Morphing",
    "Transforming", "Shrinking", "Melting", "Freezing", "Exploding",
    "Imploding", "Collapsing", "Expanding", "Radiating", "Absorbing",
    "Reflecting", "Refracting", "Focusing", "Channeling", "Meditating",
    "Remembering", "Forgetting", "Learning", "Teaching", "Knowing", "Believing",
    "Doubting", "Questioning", "Answering", "Solving", "Destroying", "Breaking",
    "Mending", "Restoring", "Corrupting", "Cleansing", "Blessing", "Cursing",
    "Judging", "Forgiving", "Seeking", "Finding", "Losing", "Winning",
    "Failing", "Surviving", "Thriving", "Vanishing", "Appearing", "Echoing",
    "Resonating", "Vibrating", "Pulsing", "Shining", "Fading", "Observing",
    "Listening", "Speaking", "Whispering", "Shouting", "Playing", "Working",
    "Resting", "Waiting", "Watching", "Plotting", "Scheming", "Strategizing",
    "Calculating", "Computing", "Processing", "Decrypting", "Encrypting",
    "Uploading", "Downloading", "Connecting", "Disconnecting", "Evolving",
    "Adapting", "Overcoming", "Mastering", "Yielding", "Submitting", "Governing",
    # Expansion
    "Thinking", "Pondering", "Contemplating", "Reflecting", "Considering",
    "Imagining", "Visualizing", "Inventing", "Innovating", "Experimenting",
    "Testing", "Measuring", "Calibrating", "Documenting", "Recording", "Logging",
    "Charting", "Graphing", "Mapping", "Modeling", "Simulating", "Predicting",
    "Forecasting", "Estimating", "Guessing", "Assuming", "Inferring", "Deducing",
    "Inducing", "Reasoning", "Arguing", "Debating", "Discussing", "Negotiating",
    "Bargaining", "Compromising", "Collaborating", "Cooperating", "Competing",
    "Challenging", "Opposing", "Resisting", "Rebelling", "Fighting", "Battling",
    "WagingWar", "Defending", "Guarding", "Shielding", "Warding", "Parrying",
    "Blocking", "Intercepting", "Avoiding", "Evading", "Escaping", "Fleeing",
    "Retreating", "Advancing", "Charging", "Pursuing", "Chasing", "Hunting",
    "Stalking", "Ambushing", "Trapping", "Capturing", "Imprisoning", "Binding",
    "Restraining", "Enslaving", "Liberating", "Freeing", "Rescuing", "Saving",
    "Helping", "Assisting", "Supporting", "Aiding", "Comforting", "Consoling",
    "Encouraging", "Motivating", "Inspiring", "Leading", "Guiding", "Directing",
    "Commanding", "Ordering", "Instructing", "Training", "Coaching", "Mentoring",
    "Advising", "Counseling", "Consulting", "Informing", "Notifying", "Warning",
    "Alerting", "Reporting", "Communicating", "Signaling", "Gesturing", "Expressing",
    "Showing", "Demonstrating", "Illustrating", "Explaining", "Describing",
    "Narrating", "Reciting", "Performing", "Acting", "Mimicking", "Impersonating",
    "Joking", "Teasing", "Flirting", "Seducing", "Charming", "Persuading",
    "Convincing", "Manipulating", "Deceiving", "Lying", "Betraying", "Tricking",
    "Swindling", "Cheating", "Stealing", "Robbing", "Pilfering", "Plundering",
    "Looting", "Smuggling", "Poaching", "Trespassing", "Violating", "Breaking",
    "Vandalizing", "Destroying", "Demolishing", "Annihilating", "Obliterating",
    "Erasing", "Deleting", "Burning", "Scorching", "Melting", "Dissolving",
    "Crushing", "Shattering", "Splintering", "Tearing", "Ripping", "Cutting",
    "Slicing", "Chopping", "Carving", "Etching", "Engraving", "Sculpting",
    "Molding", "Shaping", "Forming", "Assembling", "Constructing", "Erecting",
    "Raising", "Lifting", "Hoisting", "Lowering", "Dropping", "Placing", "Setting",
    "Arranging", "Organizing", "Sorting", "Classifying", "Categorizing", "Labeling",
    "Indexing", "Filing", "Storing", "Stockpiling", "Hoarding", "Collecting",
    "Gathering", "Harvesting", "Reaping", "Mining", "Excavating", "Drilling",
    "Digging", "Tunneling", "Exploring", "Surveying", "Scouting", "Reconnoitering",
    "Patrolling", "Searching", "Seeking", "Questing", "Journeying", "Traveling",
    "Wandering", "Roaming", "Drifting", "Migrating", "Commuting", "Driving",
    "Flying", "Floating", "Hovering", "Gliding", "Soaring", "Plummeting",
    "Diving", "Surfing", "Skating", "Skiing", "Snowboarding", "Cycling",
    "Hiking", "Trekking", "Backpacking", "Camping", "Fishing", "Boating",
    "Kayaking", "Canoeing", "Rafting", "Rowing", "Paddling", "Sailing",
    "Cruising", "Motoring", "Piloting", "Navigating", "Steering", "Maneuvering",
    "Parking", "Docking", "Landing", "Launching", "TakingOff", "Warping",
    "Jumping", "Blinking", "Phasing", "Shifting", "Teleporting", "Summoning",
    "Conjuring", "Invoking", "Evoking", "Banishing", "Dismissing", "Dispelling",
    "Nullifying", "Countering", "Abjuring", "Warding", "Shielding", "Protecting",
    "Healing", "Curing", "Mending", "Restoring", "Regenerating", "Reviving",
    "Resurrecting", "Enhancing", "Augmenting", "Boosting", "Empowering",
    "Strengthening", "Weakening", "Debilitating", "Crippling", "Hindering",
    "Slowing", "Hastening", "Accelerating", "Enchanting", "Imbuing", "Blessing",
    "Cursing", "Hexing", "Jinxing", "Bewitching", "Charming", "Transmuting",
    "Altering", "Changing", "Morphing", "Transforming", "Shapeshifting",
    "Illusioning", "Disguising", "Camouflaging", "Cloaking", "Vanishing",
    "Appearing", "Materializing", "Dematerializing", "Divining", "Scrying",
    "Predicting", "Foreseeing", "Prophesying", "Communicating", "Telepathing",
    "Controlling", "Dominating", "Influencing", "Commanding", "Compelling",
    "Possessing", "Animating", "ConstructingGolems", "RaisingUndead", "Necromancing",
    "Experimenting", "Researching", "Studying", "Learning", "Memorizing",
    "Recalling", "Forgetting", "Understanding", "Comprehending", "Interpreting",
    "Translating", "Deciphering", "Decoding", "Encoding", "Encrypting",
    "Computing", "Calculating", "Programming", "Debugging", "Testing", "Optimizing",
    "Refactoring", "Deploying", "Maintaining", "Updating", "Upgrading",
    "Downgrading", "Installing", "Uninstalling", "Configuring", "Troubleshooting",
    "Monitoring", "Logging", "Auditing", "Securing", "Hardening", "Patching",
    "BackingUp", "Restoring", "Migrating", "Cloning", "Virtualizing",
    "Containerizing", "Orchestrating", "Scaling", "LoadBalancing", "Networking",
    "Routing", "Switching", "Bridging", "Firewalling", "Filtering", "Proxying",
    "Authenticating", "Authorizing", "Accounting", "Browsing", "Searching",
    "Googling", "Surfing", "Streaming", "Downloading", "Uploading", "Sharing",
    "Posting", "Blogging", "Vlogging", "Tweeting", "Commenting", "Liking",
    "Subscribing", "Following", "Friending", "Unfriending", "Blocking", "Reporting",
    "Messaging", "Chatting", "Emailing", "Calling", "VideoConferencing", "Gaming",
    "Playing", "Competing", "Cooperating", "Winning", "Losing", "Drawing",
    "LevelingUp", "Grinding", "Farming", "Looting", "Crafting", "Trading",
    "Questing", "Raiding", "Exploring", "Roleplaying", "Strategizing", "Tacticking",
    "Practicing", "Training", "Exercising", "WorkingOut", "Stretching", "WarmingUp",
    "CoolingDown", "Lifting", "Running", "Jogging", "Walking", "Swimming",
    "Cycling", "Yogaing", "Pilatesing", "Meditating", "Relaxing", "Resting",
    "Sleeping", "Napping", "Dreaming", "Waking", "Rising", "Eating", "Drinking",
    "Feasting", "Dining", "Snacking", "Tasting", "Sipping", "Gulping", "Chewing",
    "Swallowing", "Digesting", "Breathing", "Inhaling", "Exhaling", "Panting",
    "Gasping", "Sighing", "Yawning", "Coughing", "Sneezing", "Hiccuping",
    "Burping", "Farting", "Seeing", "Looking", "Watching", "Observing", "Staring",
    "Gazing", "Glancing", "Peeking", "Squinting", "Blinking", "Winking", "Hearing",
    "Listening", "Overhearing", "Eavesdropping", "Smelling", "Sniffing", "Inhaling",
    "Tasting", "Savoring", "Licking", "Touching", "Feeling", "Probing", "Poking",
    "Stroking", "Petting", "Patting", "Grabbing", "Grasping", "Clutching",
    "Holding", "Carrying", "Lifting", "Pushing", "Pulling", "Dragging", "Throwing",
    "Catching", "Tossing", "Hitting", "Punching", "Kicking", "Slapping", "Striking",
    "Bashing", "Smashing", "Crushing", "Shooting", "Firing", "Launching",
    "Bombing", "Exploding", "Detonating", "Speaking", "Talking", "Chatting",
    "Whispering", "Muttering", "Murmuring", "Shouting", "Yelling", "Screaming",
    "Singing", "Humming", "Whistling", "Chanting", "Reciting", "Laughing",
    "Giggling", "Chuckling", "Crying", "Sobbing", "Weeping", "Wailing", "Groaning",
    "Moaning", "Grunting", "Growling", "Snarling", "Hissing", "Roaring", "Barking",
    "Meowing", "Chirping", "Croaking", "Buzzing", "Howling", "Screeching",
    "Clapping", "Snapping", "Stomping", "Tapping", "Knocking", "Banging",
    "Rattling", "Shaking", "Vibrating", "Pulsing", "Beating", "Thumping",
    "Flowing", "Streaming", "Pouring", "Dripping", "Leaking", "Seeping",
    "Gushing", "Spraying", "Splashing", "Bubbling", "Boiling", "Simmering",
    "Freezing", "Thawing", "Melting", "Evaporating", "Condensing", "Sublimating",
    "Depositing", "Growing", "Shrinking", "Expanding", "Contracting", "Swelling",
    "Blooming", "Wilting", "Sprouting", "Ripening", "Rotting", "Decaying",
    "Decomposing", "Festering", "Fermenting", "Aging", "Maturing", "Developing",
    "Evolving", "Mutating", "Adapting", "Regenerating", "Reproducing", "Breeding",
    "Spawning", "Hatching", "Birthing", "Nursing", "Nurturing", "Raising",
    "Teaching", "Educating", "Indoctrinating", "Brainwashing", "Grooming",
    "Socializing", "Integrating", "Assimilating", "Alienating", "Isolating",
    "Segregating", "Uniting", "Dividing", "Joining", "Leaving", "Entering",
    "Exiting", "Arriving", "Departing", "Staying", "Moving", "Relocating",
    "Settling", "Establishing", "Founding", "Abolishing", "Ending", "Finishing",
    "Completing", "Starting", "Beginning", "Initiating", "Continuing", "Persisting",
    "Resuming", "Pausing", "Stopping", "Ceasing", "Halting", "Interrupting",
    "Delaying", "Postponing", "Accelerating", "Slowing", "Maintaining", "Sustaining",
    "Preserving", "Conserving", "Protecting", "Saving", "Wasting", "Squandering",
    "Consuming", "Using", "Utilizing", "Employing", "Applying", "Implementing",
    "Executing", "Performing", "Operating", "Running", "Managing", "Administering",
    "Supervising", "Overseeing", "Controlling", "Governing", "Ruling", "Leading",
    "Following", "Obeying", "Serving", "Assisting", "Working", "Toiling", "Laboring",
    "Striving", "Endeavoring", "Attempting", "Trying", "Succeeding", "Achieving",
    "Accomplishing", "Failing", "Struggling", "Suffering", "Enduring", "Tolerating",
    "Accepting", "Rejecting", "Approving", "Disapproving", "Praising", "Criticizing",
    "Blaming", "Accusing", "Condemning", "Forgiving", "Pardoning", "Excusing",
    "Justifying", "Defending", "Advocating", "Supporting", "Opposing", "Protesting",
    "Demonstrating", "Petitioning", "Lobbying", "Voting", "Campaigning", "Electing",
    "Appointing", "Promoting", "Demoting", "Hiring", "Firing", "Retiring",
    "Resigning", "Investing", "Trading", "Buying", "Selling", "Bartering", "Lending",
    "Borrowing", "Donating", "Receiving", "Giving", "Taking", "Sharing", "Dividing",
    "Combining", "Merging", "Separating", "Splitting", "Connecting", "Disconnecting",
    "Linking", "Unlinking", "Attaching", "Detaching", "Binding", "Unbinding",
    "Wrapping", "Unwrapping", "Covering", "Uncovering", "Hiding", "Revealing",
    "Exposing", "Concealing", "Masking", "Disguising", "Identifying", "Recognizing",
    "Labeling", "Marking", "Branding", "Noticing", "Perceiving", "Realizing",
    "Acknowledging", "Ignoring", "Overlooking", "Forgetting", "Remembering",
    "Recollecting", "Reminiscing", "Anticipating", "Expecting", "Hoping", "Fearing",
    "Worrying", "Wishing", "Desiring", "Craving", "Yearning", "Loving", "Hating",
    "Liking", "Disliking", "Admiring", "Despising", "Respecting", "Disrespecting",
    "Trusting", "Distrusting", "Believing", "Doubting", "Questioning", "Wondering",
    "Imagining", "Fantasizing", "Hallucinating", "Focusing", "Concentrating",
    "PayingAttention", "Ignoring", "Meditating", "Praying", "Worshipping",
    "Celebrating", "Mourning", "Grieving", "Ritualizing", "Ceremonializing",
    "Consecrating", "Desecrating", "Purifying", "Tainting", "Sanctifying",
    "Defiling", "Redeeming", "Damning", "Saving", "Condemning", "Absolving",
    "Judging", "Sentencing", "Punishing", "Rewarding", "Enforcing", "Regulating",
    "Legislating", "Governing", "Diplomating", "Negotiating", "Arbitrating",
    "Mediating", "Reconciling", "Peacemaking", "Warring", "Conquering",
    "Liberating", "Colonizing", "Settling", "Pioneering", "Innovating",
    "Discovering", "Inventing", "Creating", "Artisting", "Musicking", "Writing",
    "Storytelling", "Philosophizing", "Theorizing", "Hypothesizing", "Analyzing",
    "Synthesizing", "Critiquing", "Reviewing", "Editing", "Publishing", "Broadcasting",
    "Communicating", "Teaching", "Learning", "Studying", "Researching", "Archiving",
    "Preserving", "Curating", "Exhibiting", "Performing", "Entertaining",
    "Amusing", "Distracting", "Inspiring", "Motivating", "Challenging",
    "Provoking", "Comforting", "Soothing", "Healing", "Nourishing", "Sustaining",
    "Living", "Being", "Existing", "Becoming", "Transcending", "Ascending",
    "Perishing", "Dying", "Ceasing", "Ending"
]))

# Verify list sizes BEFORE combining
print(f"Unique Professions: {len(PROFESSIONS)}")
print(f"Unique Adjectives:  {len(ADJECTIVES)}")
print(f"Unique Objects:     {len(OBJECTS)}")
print(f"Unique Actions:     {len(ACTIONS_VERBS)}")
print("-" * 20)


# Combine word lists for the first part of the username
ALL_WORD_OPTIONS = PROFESSIONS + ADJECTIVES + OBJECTS + ACTIONS_VERBS

# Options for the second part (Object or Verb/Action)
SECOND_PART_OPTIONS = OBJECTS + ACTIONS_VERBS

# --- Separators ---
SEPARATORS = ['_', '-', '.', '', ''] # Include empty string '' for no separator

# --- Special Characters ---
SINGLE_SPECIAL_CHARS = ['_', '-', '*', '#', '!', '.', ':', ';', '~', '=', '+']
SYMMETRICAL_PAIRS = [('{', '}'), ('[', ']'), ('(', ')'), ('<', '>'), ('/', '\\'), ('|', '|')]

# --- Configuration for Variability ---
SPECIAL_CHAR_ADD_PROBABILITY = 0.8
SYMMETRICAL_CHAR_PROBABILITY = 0.4
MAX_SINGLE_CHARS_COUNT = 4

# --- Generation Function ---
def generate_username():
    """Generates a single username with random components and special characters."""
    try:
        word1 = random.choice(ALL_WORD_OPTIONS)
        separator = random.choice(SEPARATORS)
        word2 = random.choice(SECOND_PART_OPTIONS)
    except IndexError:
        # Fallback if any list ended up empty (shouldn't happen with populated lists)
        return "ErrorFallbackUser"

    username_core = word1 + separator + word2

    start_chars = ""
    end_chars = ""

    include_special_chars = random.random() < SPECIAL_CHAR_ADD_PROBABILITY

    if include_special_chars:
        location = random.choice(['start', 'end', 'both'])
        use_symmetrical_pair = (location == 'both') and (random.random() < SYMMETRICAL_CHAR_PROBABILITY)

        if use_symmetrical_pair and SYMMETRICAL_PAIRS:
            open_char, close_char = random.choice(SYMMETRICAL_PAIRS)
            start_chars = open_char
            end_chars = close_char
        else:
            if location in ['start', 'both'] and SINGLE_SPECIAL_CHARS:
                k = random.randint(1, MAX_SINGLE_CHARS_COUNT)
                start_chars = ''.join(random.choices(SINGLE_SPECIAL_CHARS, k=k))
            if location in ['end', 'both'] and SINGLE_SPECIAL_CHARS:
                k = random.randint(1, MAX_SINGLE_CHARS_COUNT)
                end_chars = ''.join(random.choices(SINGLE_SPECIAL_CHARS, k=k))

    final_username = start_chars + username_core + end_chars
    final_username = final_username.strip() # Remove accidental whitespace

    # Basic check to avoid usernames that are *only* special characters
    if not any(c.isalnum() for c in final_username) and final_username:
         # If it contains no letters or numbers, generate a simpler fallback
         try:
             return random.choice(ALL_WORD_OPTIONS) + random.choice(SEPARATORS) + random.choice(SECOND_PART_OPTIONS)
         except IndexError:
             return "ErrorFallbackUser2"

    # Ensure username is not empty after stripping
    if not final_username:
        try:
             return random.choice(ALL_WORD_OPTIONS) + random.choice(SECOND_PART_OPTIONS) # Force concatenation
        except IndexError:
             return "ErrorFallbackUser3"

    return final_username

# --- Main Logic ---

output_filename = "generated.py"
output_directory = "." # Use "." for current directory, or specify a path
full_output_path = os.path.join(output_directory, output_filename)

# Check for the --make_all flag
make_all_combinations = "--make_all" in sys.argv

USERNAMES_LIST = [] # Initialize an empty list or set depending on mode

if make_all_combinations:
    print("Generating ALL unique combinations...")

    # Use a set to automatically handle uniqueness
    all_unique_usernames_set = set()

    # Calculate all core combinations (Word1 + Separator + Word2)
    core_combinations = list(itertools.product(ALL_WORD_OPTIONS, SEPARATORS, SECOND_PART_OPTIONS))
    print(f"Calculating {len(core_combinations):,} core combinations...")

    # Calculate all possible single character sequences (length 1 to MAX_SINGLE_CHARS_COUNT)
    all_single_sequences = []
    for k in range(1, MAX_SINGLE_CHARS_COUNT + 1):
        all_single_sequences.extend([''.join(seq) for seq in itertools.product(SINGLE_SPECIAL_CHARS, repeat=k)])
    # Include the empty string for cases where chars are only at one end, or none
    all_single_sequences_with_empty = [''] + all_single_sequences

    num_single_sequences = len(all_single_sequences)
    num_single_sequences_with_empty = len(all_single_sequences_with_empty)

    # Generate and add variations
    # This loop might be very long depending on list sizes and MAX_SINGLE_CHARS_COUNT
    # Progress indicator is helpful here
    total_cores = len(core_combinations)
    for i, (word1, sep, word2) in enumerate(core_combinations):
        if (i + 1) % 10000 == 0 or (i + 1) == total_cores:
             print(f"Processing core combination {i + 1:,} of {total_cores:,}...", end='\r')

        core_username = word1 + sep + word2

        # Variation 1: Core only
        all_unique_usernames_set.add(core_username)

        # Variation 2: Symmetrical pairs wrapping core
        for open_char, close_char in SYMMETRICAL_PAIRS:
            all_unique_usernames_set.add(open_char + core_username + close_char)

        # Variations 3, 4, 5: Single characters at start/end/both
        # This combines variations 3, 4, and 5 efficiently
        for start_seq in all_single_sequences_with_empty:
            for end_seq in all_single_sequences_with_empty:
                 # Avoid adding the core_username again (case where start_seq and end_seq are both empty)
                 if start_seq == '' and end_seq == '':
                     continue # Already added above

                 # Avoid adding symmetrical pair wraps here if they overlap with single chars
                 # For simplicity with large lists, we assume symmetrical pairs are distinct
                 # from repeated single chars. This might slightly overcount if a pair matches,
                 # e.g. `__username__` vs `{username}` if `_` was also in SYMMETRICAL_PAIRS.
                 # Given the typical chars in SYMMETRICAL_PAIRS and SINGLE_SPECIAL_CHARS,
                 # overlap is minimal. The set handles duplicates anyway.

                 all_unique_usernames_set.add(start_seq + core_username + end_seq)

    # Convert set to list for writing
    USERNAMES_LIST = list(all_unique_usernames_set)
    print(f"\nFinished generating {len(USERNAMES_LIST):,} unique usernames.")

else: # Default behavior: Generate a sample and print count
    NUM_USERNAMES_TO_GENERATE = 16000 # Adjust as needed
    print(f"Generating a sample of {NUM_USERNAMES_TO_GENERATE} usernames...")
    # Keep the sampling function call
    USERNAMES_LIST = [generate_username() for _ in range(NUM_USERNAMES_TO_GENERATE)]
    print("Sample generation complete.")

    # --- Calculate and Print Total Possible Combinations ---
    num_word1_options = len(ALL_WORD_OPTIONS)
    num_sep_options = len(SEPARATORS)
    num_word2_options = len(SECOND_PART_OPTIONS)
    num_core_combos = num_word1_options * num_sep_options * num_word2_options

    num_symmetrical_pair_options = len(SYMMETRICAL_PAIRS)

    # Number of possible single char sequences (length 1 to MAX)
    num_single_seq_options = sum(len(SINGLE_SPECIAL_CHARS)**k for k in range(1, MAX_SINGLE_CHARS_COUNT + 1))

    # The total number of *unique strings* possible is complex to calculate exactly
    # without generating them all and putting them in a set (which make_all does).
    # We can estimate based on the structures:
    # Core Only: num_core_combos
    # Symmetrical Wrap: num_core_combos * num_symmetrical_pair_options
    # Single Start (1-MAX): num_core_combos * num_single_seq_options
    # Single End (1-MAX): num_core_combos * num_single_seq_options
    # Single Both (1-MAX each): num_core_combos * num_single_seq_options * num_single_seq_options

    # This sum is an upper bound / estimate, as some generated strings might overlap
    # (e.g., "__user__" could potentially be generated by Single-Start-Both if "__"
    # is a sequence, or by Single-Start-End if both are "_"). The set handles this
    # in the make_all case. For printing the count, the sum is a good indicator
    # of the immense scale of potential unique combinations.
    estimated_total_unique_combos = (
        num_core_combos +
        (num_core_combos * num_symmetrical_pair_options) +
        (num_core_combos * num_single_seq_options) +
        (num_core_combos * num_single_seq_options) +
        (num_core_combos * num_single_seq_options * num_single_seq_options)
    )


    print("\n--- Potential Username Combinations ---")
    print(f"Number of Word1 options:       {num_word1_options:,}")
    print(f"Number of Separator options:   {num_sep_options:,}")
    print(f"Number of Word2 options:       {num_word2_options:,}")
    print(f"Core combinations (W1+Sep+W2): {num_core_combos:,}")
    print(f"Symmetrical Pair wraps:        {num_symmetrical_pair_options:,}")
    print(f"Single Special Sequences (1-{MAX_SINGLE_CHARS_COUNT}): {num_single_seq_options:,}")
    print("-" * 40)
    # Use the estimated total for the final number
    print(f"Estimated Total Unique Combinations (including special chars): {estimated_total_unique_combos:,}")
    print("(This is an estimate based on structural variations; exact count requires generating all)")
    print("-------------------------------------\n")


# --- Write to File (Shared Logic) ---
print(f"Writing {len(USERNAMES_LIST):,} usernames to '{full_output_path}'...")

# Format the output string as a Python list assignment
output_string = "# -*- coding: utf-8 -*-\n" # Add encoding declaration to the output file too
output_string += "# Auto-generated list of usernames\n\n"
output_string += "USERNAMES = [\n"

# Iterate through the generated list (from either mode) and write
for username in USERNAMES_LIST:
    # Escape backslashes and double quotes within the username string
    # to make it a valid Python string literal
    escaped_username = username.replace('\\', '\\\\').replace('"', '\\"')
    # Ensure output is valid UTF-8 for file writing
    try:
        output_string += f'    "{escaped_username}",\n' # Indent, quote, add comma and newline
    except UnicodeEncodeError:
        print(f"Warning: Skipping username with characters incompatible with default encoding: {username}")
        continue # Skip writing this username if it causes issues

output_string += "]\n" # Close the list definition

# Write the string to the file
try:
    # Use 'w' mode to overwrite the file if it exists, create if not
    # Specify encoding for broader character support
    with open(full_output_path, 'w', encoding='utf-8') as f:
        f.write(output_string)
    print(f"Successfully wrote {len(USERNAMES_LIST):,} usernames to '{full_output_path}'")

except IOError as e:
    print(f"Error: Could not write to file '{full_output_path}'. Reason: {e}")
except Exception as e:
    print(f"An unexpected error occurred during file writing: {e}")