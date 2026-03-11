#include <stdio.h>
#include <string.h>
int demtu(char s[]){
    int d=0;
    char*p=strtok(s," ");
    while(p!=NULL){
        d++;
        p=strtok(NULL," ");
    }
    return d;
}
int main(){  
    int a;scanf("%d\nn",&a);
    char s[200];
    for(int i=0;i<a;i++){
        gets(s);
        printf("%d\n",demtu(s));
    }
}
