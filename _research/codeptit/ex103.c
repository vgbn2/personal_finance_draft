#include <stdio.h>
int main(){
    int a;scanf("%d",&a);

   while(a--){
        int b,ar[101],max=0;
        scanf("%d",&b);

        for(int j=0;j<b;j++){
            scanf("%d",&ar[j]);
            if(ar[j]>max)
            max=ar[j];
        }
        printf("%d\n",max);

        for(int o=0;o<b;o++)
            if(ar[o]==max)
            printf("%d ",o);
        
        printf("\n");
    }
    
}