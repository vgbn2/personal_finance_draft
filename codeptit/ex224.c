#include <stdio.h>

int main (){
    int uo,d,n,sum=0;
    scanf("%d %d %d",&uo,&d,&n);
    for(int i=0;i<n;i++){
        sum+=uo;
        uo+=d;
    }
    printf("%d\n",sum);
}