#include <stdio.h>
#include <string.h>

struct tu {
    char nd[30];
    int solan;
} ds[1000];

int n = 0;

int tim(char s[]) {
    for (int i = 0; i < n; i++) {
        if (strcmp(s, ds[i].nd) == 0) return i;
    }
    return -1;
}

int main() {
    char s[30];
    while (scanf("%s", s) != -1) {
        int x = tim(s);
        if (x == -1) {
            strcpy(ds[n].nd, s);
            ds[n].solan = 1;
            n++;
        } else {
            ds[x].solan++;
        }
    }
    for(int i=0;i<n;i++){
        if(strlen(ds[i].nd)>m)m=strlen(ds[i].nd);
    }
    for (int i = 0; i < n; i++) {
        printf("%s %d\n", ds[i].nd, ds[i].solan);
    }

    return 0;
}
