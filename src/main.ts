import { mount } from 'svelte';
import App from './presentation/App.svelte';
import './presentation/styles.css';

mount(App, { target: document.getElementById('app')! });
