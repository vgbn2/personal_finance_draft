#include <stdio.h>
#include <string.h>
int main(){
    char s1[1000],s2[1000][1000];
    gets(s1);
    int d=0;
    char *token=strtok(s1," ");
    while(token!=NULL){
        strcpy(s2[d++],s1);
        token=strtok(NULL," ");
    }
}