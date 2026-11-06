# Appel du Père Noël 🎅📞

Appli Android familiale : les enfants « appellent » le Père Noël et lui parlent à voix haute.
Tout tourne **sur le téléphone, sans internet** une fois les modèles installés :

| Rôle | Techno | Taille |
|---|---|---|
| Oreilles (reconnaissance vocale) | [Vosk](https://alphacephei.com/vosk/) `vosk-model-small-fr-0.22` | ~41 Mo |
| Voix | [Piper](https://github.com/rhasspy/piper) via [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | ~65 Mo / voix |
| Cerveau | MediaPipe LLM Inference + Gemma 3 1B int4 (local) ou Gemini Flash-Lite (en ligne, clé gratuite) | ~550 Mo |

> Usage familial uniquement, pas de publication sur le Play Store.

## Avancement

- [x] **(a)** Écrans, faux appel, sonnerie, écran de premier lancement (installation des modèles)
- [x] **(b)** Reconnaissance vocale Vosk
- [x] **(c)** Voix Piper + « voix de papy » + enregistrements maison
- [x] **(d)** Cerveau local (Gemma)
- [x] **(e)** Scénario complet, garde-fous, écran Parents complet
- [ ] **(f)** Réglages et finitions (après essais sur le téléphone)

## Comment se passe un appel

1. **Sonnerie** (≈ 4,5 s) : pendant ce temps, les oreilles (Vosk), la voix (Piper) et le cerveau
   (Gemma) se chargent en parallèle, et la phrase d'accueil est pré-calculée. Si c'est plus long,
   ça sonne un peu plus.
2. **Décroché** : « Allô ? Ho ho ho ! Qui m'appelle ? C'est Lilian ou Alicia ? ».
   Le prénom est reconnu même mal transcrit ; sinon il redemande, puis demande l'âge.
3. **Sage ?** → **Qu'as-tu fait de bien ?** → **Que voudrais-tu pour Noël ?**
   Les questions sont écrites à l'avance ; le cerveau ne fait que **réagir** (1 à 2 phrases).
4. **Frères et sœurs** (réglable) : « Dis-moi Lilian, est-ce qu'Alicia est à côté de toi ? Passe-lui
   le téléphone ! », quelques secondes pour passer le téléphone, « Allô ? C'est toi, Alicia ? », puis
   les mêmes questions avec elle. Personne ne répond → « Fais-lui un gros bisou de ma part ! ».
   La **durée max s'applique à chaque enfant**.
5. **Au revoir** (« Joyeux Noël à tous les deux ! »), puis il raccroche tout seul (tonalité « occupé »).

Garde-fous :
- micro ouvert **uniquement** quand c'est à l'enfant de parler ;
- rien compris → « tu peux répéter ? », puis question reformulée simplement, puis on passe à la suite ;
- réponse hors sujet à « as-tu été sage ? » → réponse courte puis retour à la question ;
- cerveau trop lent (> 1,2 s) → « Hmm… » ; au-delà du délai max (5 s) → phrase de secours ;
- chaque phrase du cerveau est nettoyée puis **filtrée** (hors personnage, IA, infos personnelles,
  sujets sombres, promesses de cadeau, critiques, anglais) : une phrase refusée → phrase de secours ;
- 30 s avant la durée max (par enfant), il conclut gentiment.

## Prompt du cerveau

Fabriqué dans `scenario/SantaBrain.kt` :

```
Tu es le Père Noël. Tu es très vieux, chaleureux et rieur, et tu parles lentement.
Tu parles au téléphone avec {prénom}, {un garçon|une fille|un enfant} de {âge} ans.
{prénom} aime : {centres d'intérêt}.

Règles :
- Réponds en français, en 1 ou 2 phrases courtes, avec des mots simples d'enfant. Tutoie l'enfant.
- Ne demande jamais d'information personnelle : ni adresse, ni école, ni nom de famille, ni téléphone.
- Aucun sujet effrayant, violent, triste ou d'adulte. Si l'enfant en parle, parle gentiment d'autre chose : les rennes, les lutins, la neige.
- Ne promets jamais un cadeau précis. Dis plutôt que tes lutins vont faire de leur mieux.
- Ne critique jamais l'enfant. S'il dit qu'il n'a pas été sage, encourage-le avec douceur.
- Tu es le vrai Père Noël. Ne dis jamais que tu es une IA, un robot ou un programme. Si on te demande si tu es vraiment le Père Noël, réponds avec magie et malice.
- N'utilise ni emoji, ni liste, ni astérisque, ni indication de mise en scène : tes mots sont lus à voix haute.
- Ne pose pas de nouvelle question.

Ce que vous vous êtes dit juste avant : (2 derniers échanges)
Le Père Noël vient de demander : « … »
{prénom} répond : « … »

{consigne de l'étape, ex. « Réagis avec enthousiasme à son souhait, sans jamais promettre de l'apporter. »}
Réponds maintenant, uniquement avec les mots du Père Noël.
```

## Voix de papy

Deux moteurs au choix dans l'espace parents (bouton *Écouter* pour comparer) :
- **Voix Google (naturelle)**, par défaut : la synthèse vocale intégrée au téléphone, gratuite.
  Les voix marquées ☁ ont besoin d'internet pendant l'appel et sont souvent les plus naturelles.
  Si aucune voix n'apparaît : installer *Services de reconnaissance et synthèse vocale de Google*
  (Play Store) et le choisir dans *Paramètres → Accessibilité → Synthèse vocale*.
- **Piper (hors-ligne)** : Tom, Gilles, UPMC (locuteur 2 = Pierre). Plus robotique.
  Si la voix Google échoue pendant un appel, Piper prend le relais automatiquement.

Réglages :
- **voix** : celles proposées par le moteur choisi ;
- **plus grave** (1,5 demi-ton par défaut) : demandé directement au moteur Google ; avec Piper,
  obtenu en rejouant le son un peu moins vite ;
- **lenteur** (+15 %) : compensée dans la vitesse demandée à Piper ;
- **écho** : petite réverbération calculée sur le téléphone.

Enregistrements maison (*Ho ho ho !*, *Au revoir*) : enregistrer avec le Dictaphone, puis
*Importer* dans l'espace parents ; ils remplacent la voix de synthèse.

## Installer l'appli sur le téléphone (sans ordinateur)

L'APK est compilé automatiquement par GitHub à chaque modification (workflow
`.github/workflows/appel-pere-noel.yml`).

1. Sur le téléphone, ouvrir dans le navigateur (en étant connecté à GitHub) :
   **https://github.com/Newt33700/orbith/releases/tag/appel-pere-noel**
2. Toucher **`appel-pere-noel.apk`** pour le télécharger, puis l'ouvrir.
3. La première fois, Android demande d'autoriser l'installation depuis le navigateur
   (HyperOS : *Paramètres → Applications → Autorisations → Installer des applis inconnues*).
   HyperOS peut aussi lancer une « analyse de sécurité » : accepter.
4. Pour une mise à jour, refaire la même chose : la nouvelle version s'installe
   **par-dessus** l'ancienne, les modèles et réglages sont conservés.

> L'APK est signé avec une clé fixe (`app/debug.keystore`, versionnée exprès) pour que les
> mises à jour s'installent sans désinstaller l'appli. Cette clé n'a aucune valeur de sécurité.

## Installer les modèles (dans l'appli)

Au premier lancement, l'écran **« Préparer le Père Noël »** vérifie les modèles. On peut y
revenir depuis l'espace parents → *Installer / vérifier les modèles*. Faire ça en Wi-Fi.

- **Vosk** : bouton *Télécharger* (direct).
- **Piper** : boutons *Voix « Tom »*, *« Gilles »*, *« UPMC »* (direct). En installer plusieurs
  permettra de les comparer au jalon (c).
- **Gemma** : Google impose d'accepter la licence Gemma, donc pas de téléchargement direct :
  1. *Ouvrir la page* (https://huggingface.co/litert-community/Gemma3-1B-IT), se connecter
     à Hugging Face (compte gratuit), accepter la licence ;
  2. onglet *Files* → télécharger **`gemma3-1b-it-int4.task`** (~550 Mo) ;
  3. revenir dans l'appli → *Importer un fichier* → choisir le fichier dans *Téléchargements*.
     Le fichier peut ensuite être supprimé des Téléchargements.

*Importer un fichier* accepte aussi n'importe quel modèle déjà téléchargé :
`.zip`, `.tar.bz2`, `.tar.gz` (décompressés automatiquement) ou `.task`.

Les modèles sont rangés dans le dossier privé de l'appli (`/data/data/fr.famille.appelperenoel/files/models/`),
**pas** dans l'APK.

## Utilisation

- **Accueil** : gros bouton vert *Appeler*.
- **Espace parents** : garder le doigt **3 s** sur « Parents » (en bas à droite), puis résoudre
  un petit calcul. On y règle les enfants (prénom, âge, centres d'intérêt, cadeau souhaité),
  la durée max d'appel, les volumes, l'ambiance, la photo du Père Noël.
- **Son** : l'appel passe par le volume **média** (touches de volume pendant l'appel), y compris en mode silencieux.
  Le bouton haut-parleur bascule entre son fort et son doux « à l'oreille ».
- **Sous-titres** : visibles uniquement en mode debug, pour ne rien dévoiler aux enfants.
- **Mode debug** (caché) : dans l'espace parents, toucher **7 fois** le numéro de version, puis activer l'interrupteur.
  Pendant l'appel : sous-titres, transcription en direct, champ pour **taper** la réponse au lieu de parler,
  latences de chaque tour (STT, cerveau, voix, réponse totale ; vert si < 4 s) et journal.
  Réglages debug : silence de fin de phrase, délai max du cerveau, GPU, format de dialogue Gemma.

## Sons

- Sonnerie, décroché, tonalité « occupé » et ambiance (cheminée + grelots) sont **générés par
  le code** : rien à télécharger.
- Pour une vraie ambiance enregistrée : déposer un fichier libre de droits
  `app/src/main/assets/sons/ambiance.ogg` (ex. Freesound, licence CC0), il remplace l'ambiance générée.

## Compiler soi-même (facultatif)

Prérequis : JDK 17 et le SDK Android (ou Android Studio). La première compilation télécharge
l'AAR de sherpa-onnx (≈ 40 Mo) dans `app/libs/`.

```bash
cd appel-pere-noel
./gradlew assembleDebug
# APK : app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Organisation du code

```
app/src/main/java/fr/famille/appelperenoel/
├── PereNoelApp.kt         objets partagés (réglages, modèles)
├── MainActivity.kt        navigation entre les écrans
├── audio/                 session d'appel (focus, haut-parleur), lecteur PCM, sons générés, ambiance
├── stt/                   reconnaissance vocale (jalon b)
├── tts/                   voix du Père Noël (jalon c)
├── llm/                   cerveau local (jalon d)
├── engine/                interface commune des moteurs + chargement parallèle pendant la sonnerie
├── scenario/              étapes de la conversation et phrases préécrites / de secours
├── models/                emplacement, détection, téléchargement et import des modèles
├── settings/              réglages (enfants, durée, volumes…)
└── ui/                    écrans Compose : accueil, appel, parents, installation
```

## Cerveau en ligne et relances

- *Espace parents → Cerveau du Père Noël → En ligne (Gemini, gratuit)* : coller une clé créée sur
  aistudio.google.com/apikey (sans facturation, donc gratuite). Seul le texte transcrit part chez Google.
  Sans réseau, le Père Noël repasse sur Gemma (chargé après le décroché, en secours).
- Déroulé : sage ? → bonne action → petite discussion (sapin, gâteau, rennes, centres d'intérêt) → souhait.
  Après la bonne action, la discussion et le souhait, le cerveau peut poser **une** question de relance,
  puis conclut après la réponse (réglage « rebondit sur les réponses »).
- Anti-redites : questions et phrases de secours tirées parmi plusieurs variantes sans répétition,
  tout le fil de l'appel est donné au cerveau avec la consigne de ne jamais se répéter.
- Latence : silence de fin de phrase 1,0 s par défaut (réglable dans « Appel »), voix des questions et
  des phrases du cerveau calculée à l'avance pendant que l'enfant parle / que le Père Noël parle.
