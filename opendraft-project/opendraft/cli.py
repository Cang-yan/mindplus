#!/usr/bin/env python3
"""
OpenDraft CLI - AI-Powered Research Paper Generator

A simple, interactive command-line tool for generating academic papers.
"""

import sys

# Check Python version early (before any imports)
if sys.version_info < (3, 9):
    # Nice boxed error message
    PURPLE = '\033[95m'
    YELLOW = '\033[93m'
    CYAN = '\033[96m'
    GRAY = '\033[90m'
    BOLD = '\033[1m'
    RESET = '\033[0m'

    print()
    print(f"  {PURPLE}╭─────────────────────────────────────────────────────────────╮{RESET}")
    print(f"  {PURPLE}│{RESET}                                                             {PURPLE}│{RESET}")
    print(f"  {PURPLE}│{RESET}   {YELLOW}⚠️  OpenDraft requires Python 3.9 or higher{RESET}               {PURPLE}│{RESET}")
    print(f"  {PURPLE}│{RESET}                                                             {PURPLE}│{RESET}")
    print(f"  {PURPLE}│{RESET}   {GRAY}You have:{RESET} Python {sys.version_info.major}.{sys.version_info.minor}                                      {PURPLE}│{RESET}")
    print(f"  {PURPLE}│{RESET}                                                             {PURPLE}│{RESET}")
    print(f"  {PURPLE}│{RESET}   {BOLD}To fix, run:{RESET}                                              {PURPLE}│{RESET}")
    print(f"  {PURPLE}│{RESET}                                                             {PURPLE}│{RESET}")
    print(f"  {PURPLE}│{RESET}   {CYAN}conda create -n opendraft python=3.11 -y{RESET}                  {PURPLE}│{RESET}")
    print(f"  {PURPLE}│{RESET}   {CYAN}conda activate opendraft{RESET}                                  {PURPLE}│{RESET}")
    print(f"  {PURPLE}│{RESET}   {CYAN}pip install opendraft{RESET}                                     {PURPLE}│{RESET}")
    print(f"  {PURPLE}│{RESET}                                                             {PURPLE}│{RESET}")
    print(f"  {PURPLE}╰─────────────────────────────────────────────────────────────╯{RESET}")
    print()
    sys.exit(1)

# Suppress deprecation warnings from dependencies (google-generativeai, weasyprint)
import warnings
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)

# Suppress WeasyPrint's stderr warnings about missing libraries
import os
os.environ['WEASYPRINT_QUIET'] = '1'

# Minimal imports for fast startup
import json
from pathlib import Path

# Lazy import for version (fast, local file)
from opendraft.version import __version__

# Background module preloader for faster generation start
_preload_future = None

def _preload_modules():
    """Preload heavy modules in background."""
    try:
        import draft_generator
        import concurrent.futures
    except:
        pass

def start_preloading():
    """Start preloading modules in background thread."""
    global _preload_future
    if _preload_future is None:
        from concurrent.futures import ThreadPoolExecutor
        executor = ThreadPoolExecutor(max_workers=1)
        _preload_future = executor.submit(_preload_modules)
        executor.shutdown(wait=False)

# Config directory for storing API keys
CONFIG_DIR = Path.home() / '.opendraft'
CONFIG_FILE = CONFIG_DIR / 'config.json'

# ANSI color codes
class Colors:
    PURPLE = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    WHITE = '\033[97m'
    GRAY = '\033[90m'
    BOLD = '\033[1m'
    DIM = '\033[2m'
    RESET = '\033[0m'
    UNDERLINE = '\033[4m'


def get_saved_config():
    """Load saved configuration."""
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text())
        except:
            return {}
    return {}


def save_config(config):
    """Save configuration to disk."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(config, indent=2))


def has_api_key():
    """Check if API key is configured."""
    if os.getenv('GOOGLE_API_KEY'):
        return True
    config = get_saved_config()
    return bool(config.get('google_api_key'))


def get_api_key():
    """Get API key from environment or config."""
    key = os.getenv('GOOGLE_API_KEY')
    if key:
        return key
    config = get_saved_config()
    return config.get('google_api_key', '')


def clear_screen():
    """Clear terminal screen."""
    os.system('cls' if os.name == 'nt' else 'clear')


def print_logo():
    """Print ASCII art logo."""
    c = Colors
    logo = f"""
{c.PURPLE}{c.BOLD}  ┌─────────────────────────────────────────────────────┐
  │                                                     │
  │   ██████╗ ██████╗ ███████╗███╗   ██╗               │
  │  ██╔═══██╗██╔══██╗██╔════╝████╗  ██║               │
  │  ██║   ██║██████╔╝█████╗  ██╔██╗ ██║               │
  │  ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║               │
  │  ╚██████╔╝██║     ███████╗██║ ╚████║               │
  │   ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝               │
  │  ██████╗ ██████╗  █████╗ ███████╗████████╗         │
  │  ██╔══██╗██╔══██╗██╔══██╗██╔════╝╚══██╔══╝         │
  │  ██║  ██║██████╔╝███████║█████╗     ██║            │
  │  ██║  ██║██╔══██╗██╔══██║██╔══╝     ██║            │
  │  ██████╔╝██║  ██║██║  ██║██║        ██║            │
  │  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝        ╚═╝            │
  │                                                     │
  └─────────────────────────────────────────────────────┘{c.RESET}
"""
    print(logo)


def print_header():
    """Print clean header with logo."""
    c = Colors
    print_logo()
    print(f"  {c.GRAY}AI Research Paper Generator{c.RESET}  {c.DIM}v{__version__}{c.RESET}")
    print()


def print_divider():
    """Print a subtle divider."""
    print(f"  {Colors.GRAY}{'─' * 50}{Colors.RESET}")


def run_setup():
    """Interactive setup wizard."""
    c = Colors
    clear_screen()
    print_header()

    print(f"  {c.BOLD}Setup{c.RESET}")
    print_divider()
    print()
    print(f"  You need a {c.BOLD}Google AI API key{c.RESET} (free).")
    print()

    # Auto-open browser
    api_url = "https://aistudio.google.com/apikey"
    try:
        import webbrowser
        webbrowser.open(api_url)
        print(f"  {c.GREEN}✓{c.RESET} Opened {c.UNDERLINE}{api_url}{c.RESET} in browser")
    except:
        print(f"  {c.CYAN}1.{c.RESET} Open {c.UNDERLINE}{api_url}{c.RESET}")

    print()
    print(f"  {c.CYAN}→{c.RESET} Click {c.BOLD}Create API Key{c.RESET}, then copy and paste below")
    print()

    try:
        api_key = input(f"  {c.PURPLE}›{c.RESET} API Key: ").strip()
    except (KeyboardInterrupt, EOFError):
        print(f"\n\n  {c.GRAY}Cancelled.{c.RESET}\n")
        return False

    if not api_key:
        print(f"\n  {c.RED}✗{c.RESET} No key provided.\n")
        return False

    if len(api_key) < 20:
        print(f"\n  {c.RED}✗{c.RESET} Invalid key format.\n")
        return False

    config = get_saved_config()
    config['google_api_key'] = api_key
    save_config(config)
    os.environ['GOOGLE_API_KEY'] = api_key

    print()
    print(f"  {c.GREEN}✓{c.RESET} API key saved to {c.GRAY}~/.opendraft/config.json{c.RESET}")
    print()
    return True


def select_option(prompt, options, default=0):
    """Clean option selector with visible numbers."""
    c = Colors
    print(f"  {c.PURPLE}›{c.RESET} {prompt}")
    print()

    for i, (label, value) in enumerate(options):
        num = i + 1
        if i == default:
            print(f"    {c.PURPLE}{num}.{c.RESET} {c.BOLD}{label}{c.RESET} {c.GRAY}← default{c.RESET}")
        else:
            print(f"    {c.GRAY}{num}. {label}{c.RESET}")
    print()

    try:
        choice = input(f"  {c.GRAY}Enter 1-{len(options)} or press Enter:{c.RESET} ").strip()
    except (KeyboardInterrupt, EOFError):
        return None

    selected_idx = default
    if choice:
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(options):
                selected_idx = idx
        except ValueError:
            pass

    # Show what was selected
    selected_label = options[selected_idx][0]
    print(f"  {c.GREEN}✓{c.RESET} {selected_label}")
    print()

    return options[selected_idx][1]


def run_interactive():
    """Run interactive paper generation."""
    c = Colors
    clear_screen()
    print_header()

    # Start preloading heavy modules in background while user fills options
    start_preloading()

    # Check for API key
    if not has_api_key():
        print(f"  {c.YELLOW}!{c.RESET} No API key configured.")
        print()
        if not run_setup():
            return 1
        clear_screen()
        print_header()
    else:
        if not os.getenv('GOOGLE_API_KEY'):
            os.environ['GOOGLE_API_KEY'] = get_api_key()

    print(f"  {c.BOLD}New Paper{c.RESET}")
    print_divider()
    print()

    # Get topic
    try:
        print(f"  {c.PURPLE}›{c.RESET} What's your research topic?")
        print()
        topic = input(f"    ").strip()
    except (KeyboardInterrupt, EOFError):
        print(f"\n\n  {c.GRAY}Cancelled.{c.RESET}\n")
        return 0

    if not topic:
        print(f"\n  {c.RED}✗{c.RESET} No topic provided.\n")
        return 1

    print()

    # Get optional research blurb
    print(f"  {c.PURPLE}›{c.RESET} Research focus {c.GRAY}(optional - press Enter to skip){c.RESET}")
    print(f"    {c.GRAY}Add context like specific aspects, hypotheses, or constraints{c.RESET}")
    print()
    try:
        blurb = input(f"    ").strip()
    except (KeyboardInterrupt, EOFError):
        print(f"\n\n  {c.GRAY}Cancelled.{c.RESET}\n")
        return 0

    if blurb:
        print(f"  {c.GREEN}✓{c.RESET} Focus: {blurb[:60]}{'...' if len(blurb) > 60 else ''}")
    print()

    # Select level
    level = select_option(
        "Academic level",
        [
            ("Research paper", "research_paper"),
            ("Bachelor's thesis", "bachelor"),
            ("Master's thesis", "master"),
            ("PhD dissertation", "phd"),
        ],
        default=0
    )
    if level is None:
        return 0

    # Select citation style
    style = select_option(
        "Citation style",
        [
            ("APA 7th Edition", "apa"),
            ("MLA 9th Edition", "mla"),
            ("Chicago", "chicago"),
            ("IEEE", "ieee"),
        ],
        default=0
    )
    if style is None:
        return 0

    # Select language (expanded options)
    language = select_option(
        "Language",
        [
            ("English", "en"),
            ("German (Deutsch)", "de"),
            ("Spanish (Español)", "es"),
            ("French (Français)", "fr"),
            ("Other...", "other"),
        ],
        default=0
    )
    if language is None:
        return 0

    # Handle custom language input
    if language == "other":
        print(f"  {c.GRAY}Codes: it, pt, nl, zh, ja, ko, ru, ar, sv, no, pl, etc.{c.RESET}")
        try:
            language = input(f"  {c.PURPLE}›{c.RESET} Language code: ").strip().lower() or "en"
        except (KeyboardInterrupt, EOFError):
            print(f"\n\n  {c.GRAY}Cancelled.{c.RESET}\n")
            return 0

    # Language display names
    lang_names = {
        'en': 'English', 'de': 'German', 'es': 'Spanish', 'fr': 'French',
        'it': 'Italian', 'pt': 'Portuguese', 'nl': 'Dutch', 'zh': 'Chinese',
        'ja': 'Japanese', 'ko': 'Korean', 'ru': 'Russian', 'ar': 'Arabic'
    }

    # Optional: Cover page details
    print(f"  {c.PURPLE}›{c.RESET} Add cover page details? {c.GRAY}(for thesis formatting){c.RESET}")
    print(f"    {c.GRAY}Adds author, institution, advisor to title page{c.RESET}")
    print()
    try:
        add_cover = input(f"    {c.GRAY}[y/N]{c.RESET} ").strip().lower()
    except (KeyboardInterrupt, EOFError):
        print(f"\n\n  {c.GRAY}Cancelled.{c.RESET}\n")
        return 0

    author_name = None
    institution = None
    department = None
    advisor = None

    if add_cover in ['y', 'yes']:
        print()
        print(f"  {c.GRAY}Press Enter to skip any field{c.RESET}")
        print()

        try:
            author_name = input(f"  {c.PURPLE}›{c.RESET} Your name: ").strip() or None
            institution = input(f"  {c.PURPLE}›{c.RESET} Institution: ").strip() or None
            department = input(f"  {c.PURPLE}›{c.RESET} Department: ").strip() or None
            advisor = input(f"  {c.PURPLE}›{c.RESET} Advisor/Supervisor: ").strip() or None
        except (KeyboardInterrupt, EOFError):
            print(f"\n\n  {c.GRAY}Cancelled.{c.RESET}\n")
            return 0

        if any([author_name, institution, department, advisor]):
            print(f"  {c.GREEN}✓{c.RESET} Cover page details added")
        print()

    # Confirm
    print_divider()
    print()
    level_display = level.replace("_", " ").title()
    lang_display = lang_names.get(language, language.upper())
    print(f"  {c.GRAY}Topic{c.RESET}     {topic}")
    if blurb:
        print(f"  {c.GRAY}Focus{c.RESET}     {blurb[:50]}{'...' if len(blurb) > 50 else ''}")
    print(f"  {c.GRAY}Level{c.RESET}     {level_display}")
    print(f"  {c.GRAY}Style{c.RESET}     {style.upper()}")
    print(f"  {c.GRAY}Language{c.RESET}  {lang_display}")
    if author_name:
        print(f"  {c.GRAY}Author{c.RESET}    {author_name}")
    if institution:
        print(f"  {c.GRAY}Institution{c.RESET} {institution}")
    print()
    print_divider()
    print()

    try:
        confirm = input(f"  {c.PURPLE}›{c.RESET} Generate paper? {c.GRAY}[Y/n]{c.RESET} ").strip().lower()
    except (KeyboardInterrupt, EOFError):
        print(f"\n\n  {c.GRAY}Cancelled.{c.RESET}\n")
        return 0

    if confirm and confirm not in ['y', 'yes', '']:
        print(f"\n  {c.GRAY}Cancelled.{c.RESET}\n")
        return 0

    # Start generation
    print()
    print_divider()
    print()
    print(f"  {c.PURPLE}⣾{c.RESET} {c.BOLD}Generating paper...{c.RESET}")
    print(f"  {c.GRAY}This takes 10-15 minutes. Progress shown below.{c.RESET}")
    print()
    print_divider()
    print()

    try:
        from draft_generator import generate_draft

        output_dir = Path.cwd() / 'opendraft_output'

        pdf_path, docx_path = generate_draft(
            topic=topic,
            language=language,
            academic_level=level,
            output_dir=output_dir,
            skip_validation=True,
            verbose=True,
            blurb=blurb if blurb else None,
            author_name=author_name,
            institution=institution,
            department=department,
            advisor=advisor
        )

        print()
        print_divider()
        print()
        print(f"  {c.GREEN}{'━' * 40}{c.RESET}")
        print(f"  {c.GREEN}✓{c.RESET} {c.BOLD}Your paper is ready!{c.RESET}")
        print(f"  {c.GREEN}{'━' * 40}{c.RESET}")
        print()

        # Show file paths
        exports_dir = output_dir / 'exports'
        print(f"  {c.GRAY}Files saved to:{c.RESET}")
        print(f"  {exports_dir}")
        print()
        print(f"  {c.CYAN}📄{c.RESET} {pdf_path.name}")
        print(f"  {c.CYAN}📝{c.RESET} {docx_path.name}")

        # Check for ZIP
        zip_path = exports_dir / f"{pdf_path.stem}.zip"
        if zip_path.exists():
            print(f"  {c.CYAN}📦{c.RESET} {zip_path.name}")
        print()

        # Open output folder
        try:
            import subprocess
            if sys.platform == 'darwin':
                subprocess.run(['open', str(exports_dir)], check=False)
            elif sys.platform == 'win32':
                subprocess.run(['explorer', str(exports_dir)], check=False)
            elif sys.platform.startswith('linux'):
                subprocess.run(['xdg-open', str(exports_dir)], check=False)
            print(f"  {c.GRAY}Folder opened automatically.{c.RESET}")
        except:
            pass

        print()
        return 0

    except KeyboardInterrupt:
        print(f"\n\n  {c.YELLOW}!{c.RESET} Generation interrupted.\n")
        return 1
    except Exception as e:
        print()
        print(f"  {c.RED}✗{c.RESET} {e}")
        print()
        return 1


def main():
    """Main CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        prog="opendraft",
        description="AI-Powered Research Paper Generator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
{Colors.BOLD}Usage:{Colors.RESET}
  opendraft                    Interactive mode (recommended)
  opendraft setup              Configure API key
  opendraft "Your Topic"       Quick generate

{Colors.BOLD}Examples:{Colors.RESET}
  opendraft "Impact of AI on Education"
  opendraft "Climate Change" --level phd --lang de
  opendraft "Machine Learning" --author "John Smith" --institution "MIT"

{Colors.BOLD}Languages:{Colors.RESET}
  en, de, es, fr, it, pt, nl, zh, ja, ko, ru, ar

{Colors.GRAY}https://opendraft.xyz{Colors.RESET}
        """
    )

    parser.add_argument(
        "--version", "-v",
        action="version",
        version=f"opendraft {__version__}"
    )

    parser.add_argument(
        "topic",
        nargs="?",
        help="Research topic (or 'setup')"
    )

    parser.add_argument(
        "--level", "-l",
        choices=["research_paper", "bachelor", "master", "phd"],
        default="research_paper",
        help="Academic level"
    )

    parser.add_argument(
        "--style", "-s",
        choices=["apa", "mla", "chicago", "ieee"],
        default="apa",
        help="Citation style"
    )

    parser.add_argument(
        "--output", "-o",
        type=Path,
        help="Output directory"
    )

    parser.add_argument(
        "--blurb", "-b",
        type=str,
        help="Research focus/context (optional)"
    )

    parser.add_argument(
        "--lang",
        type=str,
        default="en",
        help="Language code (en, de, es, fr, etc.)"
    )

    # Optional cover page metadata
    parser.add_argument(
        "--author",
        type=str,
        help="Author name for cover page"
    )

    parser.add_argument(
        "--institution",
        type=str,
        help="Institution/university name"
    )

    parser.add_argument(
        "--department",
        type=str,
        help="Department name"
    )

    parser.add_argument(
        "--advisor",
        type=str,
        help="Advisor/supervisor name"
    )

    args = parser.parse_args()
    c = Colors

    # Handle 'setup' command
    if args.topic and args.topic.lower() == 'setup':
        return 0 if run_setup() else 1

    # Interactive mode
    if not args.topic:
        return run_interactive()

    # Quick mode
    clear_screen()
    print_header()

    if not has_api_key():
        print(f"  {c.YELLOW}!{c.RESET} Run {c.BOLD}opendraft setup{c.RESET} first.\n")
        return 1

    if not os.getenv('GOOGLE_API_KEY'):
        os.environ['GOOGLE_API_KEY'] = get_api_key()

    # Language display names for quick mode
    quick_lang_names = {
        'en': 'English', 'de': 'German', 'es': 'Spanish', 'fr': 'French',
        'it': 'Italian', 'pt': 'Portuguese', 'nl': 'Dutch', 'zh': 'Chinese',
        'ja': 'Japanese', 'ko': 'Korean', 'ru': 'Russian', 'ar': 'Arabic'
    }

    print(f"  {c.GRAY}Topic{c.RESET}  {args.topic}")
    if args.blurb:
        print(f"  {c.GRAY}Focus{c.RESET}  {args.blurb[:50]}{'...' if len(args.blurb) > 50 else ''}")
    print(f"  {c.GRAY}Level{c.RESET}  {args.level}")
    print(f"  {c.GRAY}Style{c.RESET}  {args.style.upper()}")
    print(f"  {c.GRAY}Language{c.RESET}  {quick_lang_names.get(args.lang, args.lang)}")
    if args.author:
        print(f"  {c.GRAY}Author{c.RESET}  {args.author}")
    if args.institution:
        print(f"  {c.GRAY}Institution{c.RESET}  {args.institution}")
    print()
    print_divider()
    print()
    print(f"  {c.PURPLE}⣾{c.RESET} {c.BOLD}Generating paper...{c.RESET}")
    print(f"  {c.GRAY}This takes 10-15 minutes. Progress shown below.{c.RESET}")
    print()
    print_divider()
    print()

    try:
        from draft_generator import generate_draft

        output_dir = args.output or Path.cwd() / 'opendraft_output'

        pdf_path, docx_path = generate_draft(
            topic=args.topic,
            language=args.lang,
            academic_level=args.level,
            output_dir=output_dir,
            skip_validation=True,
            verbose=True,
            blurb=args.blurb if args.blurb else None,
            author_name=args.author,
            institution=args.institution,
            department=args.department,
            advisor=args.advisor
        )

        print()
        print(f"  {c.GREEN}✓{c.RESET} {c.BOLD}Done{c.RESET}")
        print(f"  {c.GRAY}PDF{c.RESET}   {pdf_path}")
        print(f"  {c.GRAY}Word{c.RESET}  {docx_path}")
        print()
        return 0

    except KeyboardInterrupt:
        print(f"\n\n  {c.YELLOW}!{c.RESET} Interrupted.\n")
        return 1
    except Exception as e:
        print(f"  {c.RED}✗{c.RESET} {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
