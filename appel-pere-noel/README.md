# Appel du Père Noël 🎅📞

Appli Android familiale : les enfants « appellent » le Père Noël et lui parlent à voix haute.
Tout tourne **sur le téléphone, sans internet** une fois les modèles installés :

| Rôle | Techno | Taille |
|---|---|---|
| Oreilles (reconnaissance vocale) | [Vosk](https://alphacephei.com/vosk/) `vosk-model-small-fr-0.22` | ~41 Mo |
| Voix | [Piper](https://github.com/rhasspy/piper) via [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | ~65 Mo / voix |
| Cerveau | MediaPipe LLM Inference + Gemma 3 1B int4 | ~550 Mo |

> Usage familial uniquement, pas de publication sur le Play Store.

## Avancement

- [x] **(a)** Écrans, faux appel, sonnerie, écran de premier lancement (installation des modèles)
- [ ] **(b)** Reconnaissance vocale Vosk
- [ ] **(c)** Voix Piper + « voix de papy » + enregistrements maison
- [ ] **(d)** Cerveau local (Gemma)
- [ ] **(e)** Scénario complet, garde-fous, écran Parents complet
- [ ] **(f)** Réglages et finitions

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
- **Mode debug** (caché) : dans l'espace parents, toucher **7 fois** le numéro de version.

## Sons

- Sonnerie, décroché, tonalité « occupé » et ambiance (cheminée + grelots) sont **générés par
  le code** : rien à télécharger.
- Pour une vraie ambiance enregistrée : déposer un fichier libre de droits
  `app/src/main/assets/sons/ambiance.ogg` (ex. Freesound, licence CC0), il remplace l'ambiance générée.

## Compiler soi-même (facultatif)

Prérequis : JDK 17 et le SDK Android (ou Android Studio).

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
