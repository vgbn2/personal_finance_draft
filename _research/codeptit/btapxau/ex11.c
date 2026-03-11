#include <stdio.h>
#include <string.h>
int leng(char s[1000]){
    int count=0;
    for(int i=0;s[i]!='\0';i++){
        count++;
    }
    return count;
}
int main(){
    char s[1000];gets(s);
    printf("%d\n",leng(s));
}